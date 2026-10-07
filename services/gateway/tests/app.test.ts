import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { signAccessToken } from '@aquaflow/authentication';
import type { FastifyInstance } from 'fastify';
import { createGatewayApp } from '../src/app.js';

const issuer = 'aquaflow-test';
const kid = 'gateway-test-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const exportedKey = publicKey.export({ format: 'jwk' });
const publicKeysJson = JSON.stringify({
  keys: [
    {
      kty: 'RSA',
      n: exportedKey.n,
      e: exportedKey.e,
      kid,
      use: 'sig',
      alg: 'RS256',
    },
  ],
});

function token(role: 'admin' | 'billing_officer' | 'meter_reader' | 'customer' = 'admin') {
  return signAccessToken(
    { sub: 'user-1', email: 'admin@example.test', role },
    privateKey,
    issuer,
    kid,
  );
}

function gateway(
  options: {
    fetcher?: typeof fetch;
    rateLimitMax?: number;
    timeoutMs?: number;
    redisUrl?: string;
  } = {},
): FastifyInstance {
  return createGatewayApp({
    issuer,
    publicKeysJson,
    upstreams: { customer: 'http://customer.test', reading: 'http://reading.test' },
    ...options,
  });
}

describe('Gateway', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = gateway({
      fetcher: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('checks JWTs before forwarding protected routes', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/v1/customers' });
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/customers',
      headers: { authorization: 'Bearer invalid' },
    });
    const accepted = await app.inject({
      method: 'GET',
      url: '/api/v1/customers',
      headers: { authorization: `Bearer ${token()}` },
    });

    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe('UNAUTHENTICATED');
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error.code).toBe('INVALID_TOKEN');
    expect(accepted.statusCode).toBe(200);
  });

  it('requires Redis-backed rate limiting in production', () => {
    expect(() =>
      createGatewayApp({
        issuer,
        publicKeysJson,
        nodeEnv: 'production',
      }),
    ).toThrow('REDIS_URL is required in production for distributed rate limiting.');
  });

  it('keeps login public and proxies complete route paths and query strings', async () => {
    const received: string[] = [];
    const publicApp = gateway({
      fetcher: async (input) => {
        received.push(String(input));
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    try {
      const login = await publicApp.inject({
        method: 'POST',
        url: '/api/v1/login',
        payload: { email: 'admin@example.test', password: 'password' },
      });
      const reading = await publicApp.inject({
        method: 'GET',
        url: '/api/v1/readings?periodId=period-1',
        headers: { authorization: `Bearer ${token()}` },
      });

      expect(login.statusCode).toBe(200);
      expect(reading.statusCode).toBe(200);
      expect(received).toEqual([
        'http://auth:3002/api/v1/login',
        'http://reading.test/api/v1/readings?periodId=period-1',
      ]);
    } finally {
      await publicApp.close();
    }
  });

  it('returns request and correlation IDs and forwards both to dependencies', async () => {
    let forwardedHeaders: Headers | undefined;
    const idApp = gateway({
      fetcher: async (_input, init) => {
        forwardedHeaders = new Headers(init?.headers);
        return new Response('ok', { status: 200 });
      },
    });
    try {
      const response = await idApp.inject({
        method: 'GET',
        url: '/api/v1/customers',
        headers: {
          authorization: `Bearer ${token()}`,
          'x-request-id': 'request-123',
          'x-correlation-id': 'correlation-456',
        },
      });

      expect(response.headers['x-request-id']).toBe('request-123');
      expect(response.headers['x-correlation-id']).toBe('correlation-456');
      expect(forwardedHeaders?.get('x-request-id')).toBe('request-123');
      expect(forwardedHeaders?.get('x-correlation-id')).toBe('correlation-456');
    } finally {
      await idApp.close();
    }
  });

  it('supports CORS preflight without requiring a token', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/customers',
      headers: { origin: 'https://portal.example.test' },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-headers']).toContain('X-Correlation-Id');
  });

  it('returns controlled errors for upstream failure and timeout', async () => {
    const unavailableApp = gateway({
      fetcher: async () => Promise.reject(new TypeError('offline')),
    });
    const timeoutApp = gateway({
      fetcher: async () => Promise.reject(new DOMException('aborted', 'AbortError')),
    });
    try {
      const unavailable = await unavailableApp.inject({
        method: 'GET',
        url: '/api/v1/customers',
        headers: { authorization: `Bearer ${token()}` },
      });
      const timeout = await timeoutApp.inject({
        method: 'GET',
        url: '/api/v1/customers',
        headers: { authorization: `Bearer ${token()}` },
      });

      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(timeout.statusCode).toBe(504);
      expect(timeout.json().error.code).toBe('UPSTREAM_TIMEOUT');
    } finally {
      await unavailableApp.close();
      await timeoutApp.close();
    }
  });

  it('applies a bounded per-client request limit', async () => {
    const limitedApp = gateway({ rateLimitMax: 1 });
    try {
      const first = await limitedApp.inject({ method: 'GET', url: '/healthz' });
      const second = await limitedApp.inject({ method: 'GET', url: '/healthz' });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
      expect(second.json().error.code).toBe('RATE_LIMIT_EXCEEDED');
    } finally {
      await limitedApp.close();
    }
  });

  const redisTest = process.env.GATEWAY_TEST_REDIS_URL ? it : it.skip;
  redisTest('shares rate-limit counters across Gateway instances with Redis', async () => {
    const redisUrl = process.env.GATEWAY_TEST_REDIS_URL;
    if (!redisUrl) {
      throw new Error('GATEWAY_TEST_REDIS_URL must be set for the Redis integration test.');
    }
    const firstApp = gateway({ rateLimitMax: 1, redisUrl });
    const secondApp = gateway({ rateLimitMax: 1, redisUrl });
    try {
      const first = await firstApp.inject({ method: 'GET', url: '/healthz' });
      const second = await secondApp.inject({ method: 'GET', url: '/healthz' });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
    } finally {
      await firstApp.close();
      await secondApp.close();
    }
  });
});
