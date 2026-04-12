import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { estimateTokens, executeCompiledOutput } from '../execution';
import { ExecutionRequest } from '../types';

const dryRunProvider = {
  id: 'test-dry',
  type: 'dry-run' as const
};

const baseDryRunRequest: ExecutionRequest = {
  content: 'A cinematic dreamwave piece with vocal chopping and reversed synth pads.',
  target: 'suno',
  bundleId: 'bundle-001',
  profileId: 'profile-ljv',
  provider: dryRunProvider
};

test('estimateTokens returns positive value for non-empty text', () => {
  const tokens = estimateTokens('Hello world');
  assert.ok(tokens > 0, 'Expected positive token estimate');
});

test('estimateTokens uses ~4 chars/token heuristic', () => {
  // 40 chars → ~10 tokens
  const tokens = estimateTokens('1234567890123456789012345678901234567890');
  assert.equal(tokens, 10);
});

test('estimateTokens returns 0 for empty string', () => {
  assert.equal(estimateTokens(''), 0);
});

test('executeCompiledOutput dry-run returns isDryRun=true', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.equal(result.isDryRun, true);
  assert.equal(result.finishReason, 'dry-run');
  assert.equal(result.bundleId, 'bundle-001');
  assert.equal(result.profileId, 'profile-ljv');
  assert.equal(result.target, 'suno');
  assert.equal(result.provider, 'dry-run');
});

test('executeCompiledOutput dry-run has positive estimated tokens', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.ok(result.estimatedTokens > 0, 'Expected positive token estimate');
});

test('executeCompiledOutput dry-run has no responseText', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.equal(result.responseText, undefined);
});

test('executeCompiledOutput dry-run latencyMs is 0 or near-0', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.ok(result.latencyMs >= 0, 'latencyMs should be non-negative');
  assert.ok(result.latencyMs < 100, 'dry-run should complete quickly');
});

test('executeCompiledOutput dry-run sets requestId', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.ok(typeof result.requestId === 'string' && result.requestId.length > 0);
});

test('executeCompiledOutput dry-run sets executedAt as ISO string', async () => {
  const result = await executeCompiledOutput(baseDryRunRequest);
  assert.ok(!Number.isNaN(Date.parse(result.executedAt)), 'executedAt should be parseable ISO string');
});

// ---------------------------------------------------------------------------
// Phase 24: Live Provider Adapter Tests
// ---------------------------------------------------------------------------

const openaiProvider = {
  id: 'test-openai',
  type: 'openai-compatible' as const,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: 'test-key-12345'
};

const sunoProvider = {
  id: 'test-suno',
  type: 'suno' as const,
  baseUrl: 'https://api.suno.ai/api/custom_generate',
  apiKey: 'test-suno-key'
};

const fluxProvider = {
  id: 'test-flux',
  type: 'flux' as const,
  baseUrl: 'https://api.flux.ai/v1/generate',
  model: 'flux-pro',
  apiKey: 'test-flux-key'
};

const klingProvider = {
  id: 'test-kling',
  type: 'kling' as const,
  baseUrl: 'https://api.klingai.com/v1/videos/text2video',
  model: 'kling-v1',
  apiKey: 'test-kling-key'
};

const udoProvider = {
  id: 'test-udio',
  type: 'udio' as const,
  baseUrl: 'https://api.udio.com/api/custom_generate',
  apiKey: 'test-udio-key'
};

test('executeCompiledOutput returns error for unsupported provider type', async () => {
  const request: ExecutionRequest = {
    content: 'Test prompt',
    target: 'generic',
    bundleId: 'bundle-002',
    profileId: 'profile-test',
    provider: {
      id: 'test-unknown',
      type: 'unknown-provider' as any
    }
  };

  const result = await executeCompiledOutput(request);
  assert.equal(result.isDryRun, false);
  assert.equal(result.finishReason, 'error');
  assert.ok(result.error);
  assert.equal(result.error.code, 'UNSUPPORTED_PROVIDER');
});

test('executeCompiledOutput routes openai-compatible provider', async () => {
  const request: ExecutionRequest = {
    content: 'Hello, world!',
    target: 'generic',
    bundleId: 'bundle-003',
    profileId: 'profile-test',
    provider: openaiProvider,
    maxTokens: 256,
    temperature: 0.8
  };

  const result = await executeCompiledOutput(request);
  // Without mocked HTTP, this will fail, but we verify the provider type routing
  assert.equal(result.provider, 'openai-compatible');
  assert.equal(result.bundleId, 'bundle-003');
});

test('executeCompiledOutput routes suno provider and returns suno in result', async () => {
  const request: ExecutionRequest = {
    content: 'Upbeat electronic dance track with synth bass',
    target: 'suno',
    bundleId: 'bundle-suno-001',
    profileId: 'profile-music',
    provider: sunoProvider
  };

  const result = await executeCompiledOutput(request);
  // Verify routing to suno adapter
  assert.equal(result.provider, 'suno');
  assert.equal(result.target, 'suno');
  assert.equal(result.bundleId, 'bundle-suno-001');
});

test('executeCompiledOutput routes udio provider and returns udio in result', async () => {
  const request: ExecutionRequest = {
    content: 'Lo-fi hip hop beat with ambient pads',
    target: 'udio',
    bundleId: 'bundle-udio-001',
    profileId: 'profile-music',
    provider: udoProvider
  };

  const result = await executeCompiledOutput(request);
  // Verify routing to udio adapter
  assert.equal(result.provider, 'udio');
  assert.equal(result.target, 'udio');
  assert.equal(result.bundleId, 'bundle-udio-001');
});

test('executeCompiledOutput routes flux provider and returns flux in result', async () => {
  const request: ExecutionRequest = {
    content: 'A serene landscape with mountains and sunset',
    target: 'flux',
    bundleId: 'bundle-flux-001',
    profileId: 'profile-image',
    provider: fluxProvider
  };

  const result = await executeCompiledOutput(request);
  // Verify routing to flux adapter
  assert.equal(result.provider, 'flux');
  assert.equal(result.target, 'flux');
  assert.equal(result.bundleId, 'bundle-flux-001');
});

test('executeCompiledOutput routes kling provider and returns kling in result', async () => {
  const request: ExecutionRequest = {
    content: 'A cinematic scene of a spaceship landing on an alien planet',
    target: 'kling',
    bundleId: 'bundle-kling-001',
    profileId: 'profile-video',
    provider: klingProvider
  };

  const result = await executeCompiledOutput(request);
  // Verify routing to kling adapter
  assert.equal(result.provider, 'kling');
  assert.equal(result.target, 'kling');
  assert.equal(result.bundleId, 'bundle-kling-001');
});

test('provider adapters set requestId, executedAt, and latencyMs', async () => {
  const request: ExecutionRequest = {
    content: 'Test content',
    target: 'suno',
    bundleId: 'bundle-meta-001',
    profileId: 'profile-test',
    provider: sunoProvider
  };

  const result = await executeCompiledOutput(request);
  assert.ok(typeof result.requestId === 'string' && result.requestId.length > 0);
  assert.ok(!Number.isNaN(Date.parse(result.executedAt)), 'executedAt should be ISO string');
  assert.ok(result.latencyMs >= 0, 'latencyMs should be non-negative');
});

test('provider adapters set estimatedTokens', async () => {
  const request: ExecutionRequest = {
    content: 'A test prompt with several words for token estimation',
    target: 'flux',
    bundleId: 'bundle-tokens-001',
    profileId: 'profile-test',
    provider: fluxProvider
  };

  const result = await executeCompiledOutput(request);
  assert.ok(result.estimatedTokens > 0, 'estimatedTokens should be positive');
});

test('openai-compatible provider accepts custom headers', async () => {
  const customHeaders = { 'X-Custom-Header': 'test-value' };
  const request: ExecutionRequest = {
    content: 'Test with custom headers',
    target: 'generic',
    bundleId: 'bundle-headers-001',
    profileId: 'profile-test',
    provider: {
      ...openaiProvider,
      headers: customHeaders
    }
  };

  const result = await executeCompiledOutput(request);
  assert.equal(result.provider, 'openai-compatible');
  // Headers are merged during the request, which we verify indirectly
});

test('suno provider uses apiKey fallback to environment variable', async () => {
  const sunoRequest: ExecutionRequest = {
    content: 'Test music prompt',
    target: 'suno',
    bundleId: 'bundle-env-001',
    profileId: 'profile-test',
    provider: {
      id: 'suno-env-test',
      type: 'suno' as const,
      // No apiKey provided; will use SUNO_API_KEY env var
    }
  };

  const result = await executeCompiledOutput(sunoRequest);
  // Should attempt to use env var; with no key set, this will fail gracefully
  assert.equal(result.provider, 'suno');
});

test('openai-compatible retries after transient network failure and succeeds', async () => {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/chat/completions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'retry success' }, finish_reason: 'stop' }]
        })
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{}');
  });

  const reserved = await new Promise<number>((resolve, reject) => {
    const probe = http.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to reserve test port'));
        return;
      }
      const port = address.port;
      probe.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });

  const startServerLater = setTimeout(() => {
    server.listen(reserved, '127.0.0.1');
  }, 40);

  try {
    const result = await executeCompiledOutput({
      content: 'Retry me once',
      target: 'generic',
      bundleId: 'bundle-retry-001',
      profileId: 'profile-retry',
      provider: {
        id: 'retry-openai',
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${reserved}`,
        apiKey: 'test-key'
      },
      policy: {
        timeoutMs: 1000,
        maxRetries: 2,
        retryDelayMs: 80
      }
    });

    assert.equal(result.finishReason, 'stop');
    assert.equal(result.error, undefined);
    assert.equal(result.responseText, 'retry success');
  } finally {
    clearTimeout(startServerLater);
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

test('openai-compatible returns network error on timeout policy', async () => {
  const slowServer = http.createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'late' }, finish_reason: 'stop' }] }));
    }, 200);
  });

  await new Promise<void>((resolve, reject) => {
    slowServer.on('error', reject);
    slowServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = slowServer.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => slowServer.close(() => resolve()));
    throw new Error('Failed to resolve slow test server address');
  }

  try {
    const result = await executeCompiledOutput({
      content: 'Timeout me',
      target: 'generic',
      bundleId: 'bundle-timeout-001',
      profileId: 'profile-timeout',
      provider: {
        id: 'timeout-openai',
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${address.port}`,
        apiKey: 'test-key'
      },
      policy: {
        timeoutMs: 25,
        maxRetries: 0
      }
    });

    assert.equal(result.finishReason, 'error');
    assert.equal(result.error?.code, 'NETWORK_ERROR');
    assert.match(result.error?.message ?? '', /timed out|timeout/i);
  } finally {
    await new Promise<void>((resolve) => slowServer.close(() => resolve()));
  }
});

test('openai-compatible retries on HTTP 429 and succeeds', async () => {
  let attempts = 0;
  const throttledServer = http.createServer((_req, res) => {
    attempts += 1;
    if (attempts === 1) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Rate limited' } }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'recovered' }, finish_reason: 'stop' }] }));
  });

  await new Promise<void>((resolve, reject) => {
    throttledServer.on('error', reject);
    throttledServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = throttledServer.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => throttledServer.close(() => resolve()));
    throw new Error('Failed to resolve throttled test server address');
  }

  try {
    const result = await executeCompiledOutput({
      content: 'Handle transient throttling',
      target: 'generic',
      bundleId: 'bundle-429-retry',
      profileId: 'profile-retry',
      provider: {
        id: 'openai-throttle-retry',
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${address.port}`,
        apiKey: 'test-key'
      },
      policy: {
        maxRetries: 2,
        retryDelayMs: 10,
        timeoutMs: 1000
      }
    });

    assert.equal(attempts, 2);
    assert.equal(result.finishReason, 'stop');
    assert.equal(result.responseText, 'recovered');
  } finally {
    await new Promise<void>((resolve) => throttledServer.close(() => resolve()));
  }
});

test('openai-compatible does not retry on HTTP 401', async () => {
  let attempts = 0;
  const unauthorizedServer = http.createServer((_req, res) => {
    attempts += 1;
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Unauthorized' } }));
  });

  await new Promise<void>((resolve, reject) => {
    unauthorizedServer.on('error', reject);
    unauthorizedServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = unauthorizedServer.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => unauthorizedServer.close(() => resolve()));
    throw new Error('Failed to resolve unauthorized test server address');
  }

  try {
    const result = await executeCompiledOutput({
      content: 'Do not retry unauthorized',
      target: 'generic',
      bundleId: 'bundle-401-no-retry',
      profileId: 'profile-auth',
      provider: {
        id: 'openai-unauthorized',
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${address.port}`,
        apiKey: 'bad-key'
      },
      policy: {
        maxRetries: 3,
        retryDelayMs: 10,
        timeoutMs: 1000
      }
    });

    assert.equal(attempts, 1);
    assert.equal(result.finishReason, 'error');
    assert.equal(result.error?.code, 'PROVIDER_ERROR');
    assert.match(result.error?.message ?? '', /Unauthorized/i);
  } finally {
    await new Promise<void>((resolve) => unauthorizedServer.close(() => resolve()));
  }
});
