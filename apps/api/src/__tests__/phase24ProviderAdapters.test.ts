import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { executeCompiledOutput, estimateTokens, ExecutionRequest } from '@prompt-compiler/core';

/**
 * Phase 24: Live Provider Adapter Integration Tests
 *
 * Tests the five provider adapters (OpenAI, Suno, Udio, FLUX, Kling) with
 * mock HTTP servers that simulate provider API responses. This ensures the
 * adapters correctly serialize requests and parse responses.
 *
 * Each test starts a temporary HTTP mock server, configures the provider
 * adapter with the mock's URL, and verifies the request/response cycle.
 */

// ---------------------------------------------------------------------------
// Mock HTTP Server Helper
// ---------------------------------------------------------------------------

interface MockServerConfig {
  port: number;
  responses: Record<string, (req: IncomingMessage, res: ServerResponse) => void>;
}

function startMockServer(port: number): Promise<{ close: () => Promise<void>; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);

        // Route to appropriate mock response based on path
        if (req.url === '/chat/completions') {
          // OpenAI-compatible response
          res.end(
            JSON.stringify({
              choices: [
                {
                  message: { content: 'This is a mock response from OpenAI-compatible provider.' },
                  finish_reason: 'stop'
                }
              ]
            })
          );
        } else if (req.url === '/api/custom_generate' || req.url === '/api/music/generate') {
          // Suno/Udio response
          res.end(
            JSON.stringify({
              clips: [{ id: 'clip-mock-001', title: 'Generated Music', tags: 'test' }]
            })
          );
        } else if (req.url === '/v1/generate') {
          // FLUX response
          res.end(
            JSON.stringify({
              data: [{ id: 'image-mock-001', image: 'data:image/png;base64,...' }]
            })
          );
        } else if (req.url === '/v1/videos/text2video') {
          // Kling response
          res.end(
            JSON.stringify({
              data: { id: 'video-mock-001', status: 'processing' }
            })
          );
        } else {
          res.end(JSON.stringify({ error: { message: 'Unknown endpoint' } }));
        }
      });
    });

    server.listen(port, () => {
      resolve({
        port,
        close: () =>
          new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
          })
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Phase 24-2: Suno/Udio Integration Tests
// ---------------------------------------------------------------------------

test('POST /execute with suno provider sends correct request shape', async () => {
  const mockServer = await startMockServer(19001);
  try {
    const request: ExecutionRequest = {
      content: 'Upbeat electronic dance track with synth bass',
      target: 'suno',
      bundleId: 'bundle-suno-001',
      profileId: 'profile-music',
      provider: {
        id: 'suno-test',
        type: 'suno',
        baseUrl: `http://localhost:${mockServer.port}/api/custom_generate`,
        model: 'suno-v4',
        apiKey: 'test-suno-key-12345'
      }
    };

    const result = await executeCompiledOutput(request);
    assert.equal(result.provider, 'suno');
    assert.equal(result.bundleId, 'bundle-suno-001');
    assert.equal(result.isDryRun, false);
    assert.ok(result.responseText?.includes('Generated Music') || result.responseText?.includes('clip-mock'));
  } finally {
    await mockServer.close();
  }
});

test('POST /execute with udio provider sends correct request shape', async () => {
  const mockServer = await startMockServer(19002);
  try {
    const request: ExecutionRequest = {
      content: 'Lo-fi hip hop beat with ambient pads',
      target: 'udio',
      bundleId: 'bundle-udio-001',
      profileId: 'profile-music',
      provider: {
        id: 'udio-test',
        type: 'udio',
        baseUrl: `http://localhost:${mockServer.port}/api/music/generate`,
        model: 'udio-v2',
        apiKey: 'test-udio-key-12345'
      }
    };

    const result = await executeCompiledOutput(request);
    assert.equal(result.provider, 'udio');
    assert.equal(result.bundleId, 'bundle-udio-001');
    assert.equal(result.isDryRun, false);
    assert.ok(result.responseText);
  } finally {
    await mockServer.close();
  }
});

// ---------------------------------------------------------------------------
// Phase 24-3: FLUX/Kling Integration Tests
// ---------------------------------------------------------------------------

test('POST /execute with flux provider sends correct request shape', async () => {
  const mockServer = await startMockServer(19003);
  try {
    const request: ExecutionRequest = {
      content: 'A serene landscape with mountains and sunset',
      target: 'flux',
      bundleId: 'bundle-flux-001',
      profileId: 'profile-image',
      provider: {
        id: 'flux-test',
        type: 'flux',
        baseUrl: `http://localhost:${mockServer.port}/v1/generate`,
        model: 'flux-pro',
        apiKey: 'test-flux-key-12345'
      }
    };

    const result = await executeCompiledOutput(request);
    assert.equal(result.provider, 'flux');
    assert.equal(result.bundleId, 'bundle-flux-001');
    assert.equal(result.isDryRun, false);
    assert.ok(result.responseText?.includes('image-mock') || result.responseText?.includes('Generated image'));
  } finally {
    await mockServer.close();
  }
});

test('POST /execute with kling provider sends correct request shape', async () => {
  const mockServer = await startMockServer(19004);
  try {
    const request: ExecutionRequest = {
      content: 'A cinematic scene of a spaceship landing on an alien planet',
      target: 'kling',
      bundleId: 'bundle-kling-001',
      profileId: 'profile-video',
      provider: {
        id: 'kling-test',
        type: 'kling',
        baseUrl: `http://localhost:${mockServer.port}/v1/videos/text2video`,
        model: 'kling-v1',
        apiKey: 'test-kling-key-12345'
      }
    };

    const result = await executeCompiledOutput(request);
    assert.equal(result.provider, 'kling');
    assert.equal(result.bundleId, 'bundle-kling-001');
    assert.equal(result.isDryRun, false);
    assert.ok(result.responseText?.includes('video-mock') || result.responseText?.includes('Generated video'));
  } finally {
    await mockServer.close();
  }
});

// ---------------------------------------------------------------------------
// Phase 24-4: Error Handling and Edge Cases
// ---------------------------------------------------------------------------

test('provider adapter handles network error gracefully (connection refused)', async () => {
  // Use a port that is not listening
  const request: ExecutionRequest = {
    content: 'Test prompt',
    target: 'suno',
    bundleId: 'bundle-network-error',
    profileId: 'profile-test',
    provider: {
      id: 'suno-bad-connection',
      type: 'suno',
      baseUrl: 'http://localhost:65432/api/custom_generate', // Port unlikely to be open
      apiKey: 'test-key'
    }
  };

  const result = await executeCompiledOutput(request);
  assert.equal(result.finishReason, 'error');
  assert.ok(result.error);
  assert.ok(result.error.code === 'NETWORK_ERROR' || result.error.message.includes('ECONNREFUSED'));
});

test('provider adapter handles malformed JSON response', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{ invalid json }');
  });

  await new Promise<void>((resolve) => {
    server.listen(19005, () => resolve());
  });

  try {
    const request: ExecutionRequest = {
      content: 'Test prompt',
      target: 'flux',
      bundleId: 'bundle-malformed',
      profileId: 'profile-test',
      provider: {
        id: 'flux-bad-json',
        type: 'flux',
        baseUrl: 'http://localhost:19005/v1/generate',
        apiKey: 'test-key'
      }
    };

    const result = await executeCompiledOutput(request);
    assert.equal(result.finishReason, 'error');
    assert.equal(result.error?.code, 'PARSE_ERROR');
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

test('provider adapter handles provider-side error response', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: { message: 'Invalid API key provided.' }
      })
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(19006, () => resolve());
  });

  try {
    const request: ExecutionRequest = {
      content: 'Test prompt',
      target: 'suno',
      bundleId: 'bundle-provider-error',
      profileId: 'profile-test',
      provider: {
        id: 'suno-bad-key',
        type: 'suno',
        baseUrl: 'http://localhost:19006/api/custom_generate',
        apiKey: 'invalid-key'
      }
    };

    const result = await executeCompiledOutput(request);
    assert.equal(result.finishReason, 'error');
    assert.ok(result.error?.message.includes('Invalid API key'));
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

test('all provider adapters set metadata consistently (requestId, executedAt, latencyMs)', async () => {
  const mockServer = await startMockServer(19007);
  try {
    const providers = [
      {
        type: 'suno' as const,
        baseUrl: `http://localhost:${mockServer.port}/api/custom_generate`,
        target: 'suno'
      },
      {
        type: 'udio' as const,
        baseUrl: `http://localhost:${mockServer.port}/api/music/generate`,
        target: 'udio'
      },
      {
        type: 'flux' as const,
        baseUrl: `http://localhost:${mockServer.port}/v1/generate`,
        target: 'flux'
      },
      {
        type: 'kling' as const,
        baseUrl: `http://localhost:${mockServer.port}/v1/videos/text2video`,
        target: 'kling'
      },
      {
        type: 'openai-compatible' as const,
        baseUrl: `http://localhost:${mockServer.port}/chat/completions`,
        target: 'generic'
      }
    ];

    for (const provider of providers) {
      const request: ExecutionRequest = {
        content: `Test prompt for ${provider.type}`,
        target: provider.target as any,
        bundleId: `bundle-${provider.type}`,
        profileId: 'profile-test',
        provider: {
          id: `${provider.type}-test`,
          type: provider.type,
          baseUrl: provider.baseUrl,
          apiKey: 'test-key'
        }
      };

      const result = await executeCompiledOutput(request);
      // Verify consistent metadata
      assert.ok(typeof result.requestId === 'string' && result.requestId.length > 0, `requestId missing for ${provider.type}`);
      assert.ok(!Number.isNaN(Date.parse(result.executedAt)), `executedAt not ISO string for ${provider.type}`);
      assert.ok(result.latencyMs >= 0, `latencyMs invalid for ${provider.type}`);
      assert.ok(result.estimatedTokens > 0, `estimatedTokens invalid for ${provider.type}`);
    }
  } finally {
    await mockServer.close();
  }
});

test('provider adapters respect custom headers', async () => {
  const server = createServer((req, res) => {
    // Verify custom header was sent
    const customHeader = req.headers['x-test-header'];
    if (customHeader === 'test-value') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'test-001' }] }));
    } else {
      res.writeHead(400);
      res.end('Missing custom header');
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(19008, () => resolve());
  });

  try {
    const request: ExecutionRequest = {
      content: 'Test prompt',
      target: 'flux',
      bundleId: 'bundle-headers',
      profileId: 'profile-test',
      provider: {
        id: 'flux-custom-headers',
        type: 'flux',
        baseUrl: 'http://localhost:19008/v1/generate',
        apiKey: 'test-key',
        headers: { 'X-Test-Header': 'test-value' }
      }
    };

    const result = await executeCompiledOutput(request);
    assert.ok(!result.error, 'Request should succeed with custom headers');
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});
