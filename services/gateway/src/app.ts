import { randomUUID } from 'node:crypto';
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';
import {
  AccessTokenVerificationError,
  loadJwtVerificationConfig,
  verifyAccessToken,
} from '@aquaflow/authentication';

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const publicRoutes = new Set([
  '/healthz',
  '/api/v1/gateway-status',
  '/api/v1/login',
  '/api/v1/refresh',
  '/api/v1/register',
  '/.well-known/jwks.json',
]);
const forwardedHeaders = [
  'accept',
  'authorization',
  'content-type',
  'idempotency-key',
  'x-correlation-id',
  'x-request-id',
];
const responseHeaders = ['content-type', 'location', 'retry-after'];

type GatewayUpstreams = {
  customer: string;
  auth: string;
  reading: string;
  billing: string;
  payment: string;
  notification: string;
};

export interface GatewayOptions {
  issuer: string;
  publicKeysJson: string;
  nodeEnv?: string;
  upstreams?: Partial<GatewayUpstreams>;
  timeoutMs?: number;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  redisUrl?: string;
  fetcher?: typeof fetch;
}

const defaultUpstreams: GatewayUpstreams = {
  customer: 'http://customer:3001',
  auth: 'http://auth:3002',
  reading: 'http://reading:3003',
  billing: 'http://billing:3004',
  payment: 'http://payment:3005',
  notification: 'http://notification:3006',
};

const proxyRoutes: Array<[keyof GatewayUpstreams, string, string[]]> = [
  ['customer', 'GET', ['/api/v1/customers', '/api/v1/customers/:id']],
  [
    'customer',
    'POST',
    ['/api/v1/customers', '/api/v1/accounts', '/api/v1/meters/install', '/api/v1/meters/replace'],
  ],
  [
    'customer',
    'GET',
    ['/api/v1/accounts', '/api/v1/accounts/:id/meters', '/api/v1/meters', '/api/v1/info'],
  ],
  ['customer', 'PATCH', ['/api/v1/accounts/:id/status']],
  [
    'auth',
    'POST',
    [
      '/api/v1/login',
      '/api/v1/logout',
      '/api/v1/refresh',
      '/api/v1/register',
      '/api/v1/users',
      '/api/v1/customer-invitations',
    ],
  ],
  [
    'auth',
    'GET',
    ['/api/v1/me', '/.well-known/jwks.json', '/api/v1/users', '/api/v1/audit-events'],
  ],
  ['reading', 'GET', ['/api/v1/periods', '/api/v1/readings', '/api/v1/readings/flagged']],
  [
    'reading',
    'POST',
    ['/api/v1/periods', '/api/v1/readings/submit', '/api/v1/readings/:id/review'],
  ],
  ['billing', 'GET', ['/api/v1/tariffs', '/api/v1/bills']],
  ['billing', 'POST', ['/api/v1/tariffs', '/api/v1/bill-runs/preview', '/api/v1/bills']],
  ['payment', 'GET', ['/api/v1/payments']],
  ['payment', 'POST', ['/api/v1/payments']],
  ['notification', 'GET', ['/api/v1/notifications']],
  ['notification', 'POST', ['/api/v1/notifications']],
];

function validRequestId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && requestIdPattern.test(value) ? value : undefined;
}

function isGatewayOptions(value: NodeJS.ProcessEnv | GatewayOptions): value is GatewayOptions {
  return typeof value.issuer === 'string' && typeof value.publicKeysJson === 'string';
}

export function createGatewayApp(
  envOrOptions: NodeJS.ProcessEnv | GatewayOptions = process.env,
): FastifyInstance {
  const options: GatewayOptions = isGatewayOptions(envOrOptions)
    ? envOrOptions
    : {
        issuer: envOrOptions.JWT_ISSUER ?? 'aquaflow',
        publicKeysJson: envOrOptions.JWT_PUBLIC_KEYS_JSON ?? '',
        nodeEnv: envOrOptions.NODE_ENV,
        upstreams: {
          customer: envOrOptions.CUSTOMER_URL ?? defaultUpstreams.customer,
          auth: envOrOptions.AUTH_URL ?? defaultUpstreams.auth,
          reading: envOrOptions.READING_URL ?? defaultUpstreams.reading,
          billing: envOrOptions.BILLING_URL ?? defaultUpstreams.billing,
          payment: envOrOptions.PAYMENT_URL ?? defaultUpstreams.payment,
          notification: envOrOptions.NOTIFICATION_URL ?? defaultUpstreams.notification,
        },
        timeoutMs: Number(envOrOptions.UPSTREAM_TIMEOUT_MS ?? 5000),
        rateLimitMax: Number(envOrOptions.RATE_LIMIT_MAX ?? 120),
        rateLimitWindowMs: Number(envOrOptions.RATE_LIMIT_WINDOW_MS ?? 60_000),
        redisUrl: envOrOptions.REDIS_URL,
      };
  if (options.nodeEnv === 'production' && !options.redisUrl) {
    throw new Error('REDIS_URL is required in production for distributed rate limiting.');
  }
  const jwtConfig = loadJwtVerificationConfig(options.issuer, options.publicKeysJson);
  const upstreams = { ...defaultUpstreams, ...options.upstreams };
  const fetcher = options.fetcher ?? fetch;
  const app = fastify({
    logger: {
      level: 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        censor: '[REDACTED]',
      },
    },
    requestIdHeader: 'x-request-id',
    genReqId: (request) => validRequestId(request.headers['x-request-id']) ?? randomUUID(),
  });

  const redis = options.redisUrl
    ? new Redis(options.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 })
    : undefined;
  void app.register(rateLimit, {
    global: true,
    max: options.rateLimitMax ?? 120,
    timeWindow: options.rateLimitWindowMs ?? 60_000,
    ...(redis ? { redis } : {}),
    keyGenerator: (request: FastifyRequest) => request.ip,
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Try again later.' },
    }),
  });

  app.register(async (gateway) => {
    gateway.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = validRequestId(request.headers['x-correlation-id']) ?? request.id;
      reply.header('x-request-id', request.id);
      reply.header('x-correlation-id', correlationId);
      reply.header('access-control-allow-origin', '*');
      reply.header('access-control-allow-methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
      reply.header(
        'access-control-allow-headers',
        'Accept,Content-Type,Authorization,Idempotency-Key,X-Request-Id,X-Correlation-Id',
      );
    });

    gateway.addHook('preHandler', async (request, reply) => {
      if (request.method === 'OPTIONS' || publicRoutes.has(request.routeOptions.url ?? '')) {
        return;
      }

      const bearer = request.headers.authorization?.match(/^Bearer ([^\s]+)$/);
      if (!bearer) {
        return reply.code(401).send({
          error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
        });
      }

      try {
        verifyAccessToken(bearer[1], jwtConfig);
      } catch (error) {
        if (!(error instanceof AccessTokenVerificationError)) {
          throw error;
        }
        return reply.code(401).send({
          error: { code: 'INVALID_TOKEN', message: 'Token verification failed.' },
        });
      }
    });

    gateway.setErrorHandler((error, request, reply) => {
      request.log.error({ err: error }, 'Gateway request failed');
      const proposedStatusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? error.statusCode
          : undefined;
      const statusCode =
        typeof proposedStatusCode === 'number' &&
        proposedStatusCode >= 400 &&
        proposedStatusCode < 500
          ? proposedStatusCode
          : 500;
      if (statusCode === 429) {
        return reply.code(429).send({
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Try again later.' },
        });
      }
      return reply.code(statusCode).send({
        error: {
          code: statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message:
            statusCode === 400
              ? 'Request could not be processed.'
              : 'An unexpected error occurred.',
        },
      });
    });

    gateway.options('*', async (_, reply) => reply.code(204).send());

    gateway.get('/healthz', async () => ({
      status: 'ok',
      service: 'gateway',
      timestamp: new Date().toISOString(),
    }));
    gateway.get('/api/v1/gateway-status', async () => ({ service: 'gateway', status: 'healthy' }));

    const proxy = async (upstream: string, request: FastifyRequest, reply: FastifyReply) => {
      const url = new URL(request.url, upstream);
      const headers = new Headers();
      for (const name of forwardedHeaders) {
        const value = request.headers[name];
        if (typeof value === 'string') {
          headers.set(name, value);
        }
      }
      headers.set('x-request-id', request.id);
      headers.set(
        'x-correlation-id',
        validRequestId(request.headers['x-correlation-id']) ?? request.id,
      );

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
      let response: Response;
      try {
        response = await fetcher(url, {
          method: request.method,
          headers,
          body: ['GET', 'HEAD'].includes(request.method)
            ? undefined
            : request.body === undefined
              ? undefined
              : JSON.stringify(request.body),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          request.log.warn({ upstream, err: error }, 'Gateway upstream timed out');
          return reply.code(504).send({
            error: { code: 'UPSTREAM_TIMEOUT', message: 'A dependency did not respond in time.' },
          });
        }
        if (error instanceof TypeError) {
          request.log.warn({ upstream, err: error }, 'Gateway upstream is unavailable');
          return reply.code(503).send({
            error: { code: 'UPSTREAM_UNAVAILABLE', message: 'A dependency is unavailable.' },
          });
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      for (const name of responseHeaders) {
        const value = response.headers.get(name);
        if (value) {
          reply.header(name, value);
        }
      }
      reply.code(response.status);
      const payload = await response.text();
      if (!payload || request.method === 'HEAD') {
        return reply.send();
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        try {
          return reply.send(JSON.parse(payload));
        } catch (error) {
          request.log.error({ upstream, err: error }, 'Gateway received malformed JSON upstream');
          return reply.code(502).send({
            error: {
              code: 'INVALID_UPSTREAM_RESPONSE',
              message: 'A dependency returned an invalid response.',
            },
          });
        }
      }
      return reply.send(payload);
    };

    for (const [service, method, paths] of proxyRoutes) {
      for (const path of paths) {
        gateway.route({
          method: method as 'GET' | 'POST' | 'PATCH',
          url: path,
          handler: async (request, reply) => proxy(upstreams[service], request, reply),
        });
      }
    }
  });

  app.addHook('onClose', async () => {
    if (redis) {
      await redis.quit();
    }
  });

  return app;
}
