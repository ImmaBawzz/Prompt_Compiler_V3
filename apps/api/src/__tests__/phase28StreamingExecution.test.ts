import test from 'node:test';
import assert from 'node:assert/strict';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { createServer } from '../server';
import { createInMemoryUsageLedgerStore, UsageLedgerStore } from '@prompt-compiler/core';

interface StreamingEvent {
  event: string;
  data: unknown;
}

function parseSseEvents(body: string): StreamingEvent[] {
  const blocks = body
    .split('\n\n')
    .map((value) => value.trim())
    .filter(Boolean);

  const events: StreamingEvent[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const eventLine = lines.find((line) => line.startsWith('event:'));
    const dataLine = lines.find((line) => line.startsWith('data:'));
    if (!eventLine || !dataLine) {
      continue;
    }

    const event = eventLine.slice('event:'.length).trim();
    const rawData = dataLine.slice('data:'.length).trim();
    let data: unknown = rawData;
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }

    events.push({ event, data });
  }

  return events;
}

async function withStreamingServer(fn: (ctx: { port: number; ledger: UsageLedgerStore }) => Promise<void>): Promise<void> {
  const ledger = createInMemoryUsageLedgerStore();
  const server = createServer({ authConfig: { bypassAuth: true }, usageLedgerStore: ledger });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    await fn({ port, ledger });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function withOpenAiMockServer(
  fn: (ctx: { baseUrl: string }) => Promise<void>
): Promise<void> {
  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/chat/completions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: { content: 'streaming mock completion' },
              finish_reason: 'stop'
            }
          ]
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Not found' } }));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    await fn({ baseUrl: `http://127.0.0.1:${port}` });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('phase28 streaming: /execute/stream emits started, progress, and completed events for dry-run', async () => {
  await withStreamingServer(async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/execute/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'stream dry-run payload',
        target: 'suno',
        bundleId: 'bundle-stream-dry',
        profileId: 'profile-stream',
        provider: { id: 'dry', type: 'dry-run' }
      })
    });

    assert.equal(response.status, 200);
    const contentType = response.headers.get('content-type') ?? '';
    assert.match(contentType, /text\/event-stream/i);

    const body = await response.text();
    const events = parseSseEvents(body);
    const eventNames = events.map((item) => item.event);
    assert.deepEqual(eventNames, ['started', 'progress', 'completed']);

    const completed = events.find((item) => item.event === 'completed');
    assert.ok(completed);
    const completedData = completed.data as { result?: { isDryRun?: boolean } };
    assert.equal(completedData.result?.isDryRun, true);
  });
});

test('phase28 streaming: live /execute/stream records metered usage and emits completed result', async () => {
  await withOpenAiMockServer(async ({ baseUrl }) => {
    await withStreamingServer(async ({ port, ledger }) => {
      const accountId = 'acct-stream-live';
      const response = await fetch(`http://127.0.0.1:${port}/execute/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-account-id': accountId },
        body: JSON.stringify({
          content: 'stream live payload',
          target: 'generic',
          bundleId: 'bundle-stream-live',
          profileId: 'profile-stream',
          provider: {
            id: 'openai-stream',
            type: 'openai-compatible',
            baseUrl,
            model: 'gpt-test'
          },
          mode: 'hosted',
          entitlements: ['credits.compute']
        })
      });

      assert.equal(response.status, 200);
      const body = await response.text();
      const events = parseSseEvents(body);
      const eventNames = events.map((item) => item.event);
      assert.deepEqual(eventNames, ['started', 'progress', 'progress', 'completed']);

      const completed = events.find((item) => item.event === 'completed');
      assert.ok(completed);
      const completedData = completed.data as { result?: { provider?: string; isDryRun?: boolean } };
      assert.equal(completedData.result?.provider, 'openai-compatible');
      assert.equal(completedData.result?.isDryRun, false);

      const executeSummary = ledger.summarizeAccount(accountId, { domain: 'execute', unit: 'request' });
      assert.equal(executeSummary.totalEvents, 1);
      assert.equal(executeSummary.totalsByDomain.execute, 1);
    });
  });
});
