import { describe, expect, it, vi } from 'vitest';
import { checkEndpoint, runHealthcheck } from './healthcheck.mjs';

describe('root health check', () => {
  it('checks the Gateway and Web endpoints', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    const output = [];
    const healthy = await runHealthcheck(
      {
        GATEWAY_HEALTH_URL: 'http://localhost:18080/healthz',
        WEB_HEALTH_URL: 'http://localhost:13000/',
      },
      fetcher,
      (line) => output.push(line),
    );

    expect(healthy).toBe(true);
    expect(fetcher.mock.calls.map(([url]) => url).sort()).toEqual([
      'http://localhost:13000/',
      'http://localhost:18080/healthz',
    ]);
    expect(output).toEqual(['PASS Gateway: HTTP 200', 'PASS Web: HTTP 200']);
  });

  it('fails when an endpoint returns a non-success status', async () => {
    const result = await checkEndpoint(
      'Gateway',
      'http://localhost:8080/healthz',
      async () => new Response(null, { status: 503 }),
    );

    expect(result).toEqual({ name: 'Gateway', ok: false, detail: 'HTTP 503' });
  });

  it('fails safely when an endpoint cannot be reached', async () => {
    const result = await checkEndpoint('Web', 'http://localhost:3000/', async () => {
      throw new TypeError('connection failed');
    });

    expect(result).toEqual({ name: 'Web', ok: false, detail: 'connection failed' });
  });
});
