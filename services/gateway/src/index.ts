import fastify, { FastifyReply, FastifyRequest } from 'fastify';

const app = fastify({ logger: false });
const CUSTOMER_URL = process.env.CUSTOMER_URL ?? 'http://customer:3001';
const AUTH_URL = process.env.AUTH_URL ?? 'http://auth:3002';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const requests = new Map<string, number[]>();

app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
  const key = request.ip ?? 'anonymous';
  const now = Date.now();
  const history = requests.get(key) ?? [];
  const recent = history.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requests.set(key, recent);

  if (recent.length > RATE_LIMIT_MAX) {
    reply.code(429);
    throw new Error('Rate limit exceeded');
  }

  reply.header('x-request-id', request.id);
  reply.header('access-control-allow-origin', '*');
  reply.header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  reply.header('access-control-allow-headers', 'Content-Type,Authorization,Idempotency-Key');
});

app.options('*', async (_, reply) => {
  reply.header('access-control-allow-origin', '*');
  reply.header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  reply.header('access-control-allow-headers', 'Content-Type,Authorization,Idempotency-Key');
  return reply.code(204).send();
});

const proxy = async (upstream: string, request: FastifyRequest, reply: FastifyReply) => {
  const url = new URL(request.url, upstream);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: request.method,
      headers: {
        ...(request.headers as Record<string, string>),
        host: undefined as unknown as string,
      },
      body: ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : JSON.stringify(request.body ?? {}),
      signal: controller.signal,
    });

    const payload = await response.text();
    const contentType = response.headers.get('content-type') ?? 'application/json';
    reply.code(response.status);
    reply.header('content-type', contentType);
    return payload
      ? contentType.includes('application/json')
        ? JSON.parse(payload)
        : payload
      : null;
  } catch (error) {
    reply
      .code(503)
      .send({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'A dependency is unavailable.' } });
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

app.get('/healthz', async () => ({
  status: 'ok',
  service: 'gateway',
  timestamp: new Date().toISOString(),
}));

app.get('/api/v1/gateway-status', async () => ({
  service: 'gateway',
  status: 'healthy',
}));

app.get('/api/v1/customers', async (request, reply) => proxy(CUSTOMER_URL, request, reply));
app.get('/api/v1/customers/:id', async (request, reply) => proxy(CUSTOMER_URL, request, reply));
app.post('/api/v1/customers', async (request, reply) => proxy(CUSTOMER_URL, request, reply));
app.get('/api/v1/accounts', async (request, reply) => proxy(CUSTOMER_URL, request, reply));
app.post('/api/v1/accounts', async (request, reply) => proxy(CUSTOMER_URL, request, reply));
app.patch('/api/v1/accounts/:id/status', async (request, reply) =>
  proxy(CUSTOMER_URL, request, reply),
);
app.get('/api/v1/accounts/:id/meters', async (request, reply) =>
  proxy(CUSTOMER_URL, request, reply),
);
app.get('/api/v1/meters', async (request, reply) => proxy(CUSTOMER_URL, request, reply));
app.post('/api/v1/meters/install', async (request, reply) => proxy(CUSTOMER_URL, request, reply));
app.post('/api/v1/meters/replace', async (request, reply) => proxy(CUSTOMER_URL, request, reply));

app.post('/api/v1/login', async (request, reply) => proxy(AUTH_URL, request, reply));
app.get('/api/v1/me', async (request, reply) => proxy(AUTH_URL, request, reply));
app.post('/api/v1/refresh', async (request, reply) => proxy(AUTH_URL, request, reply));
app.get('/api/v1/users', async (request, reply) => proxy(AUTH_URL, request, reply));
app.post('/api/v1/users', async (request, reply) => proxy(AUTH_URL, request, reply));

const start = async () => {
  const port = Number(process.env.PORT ?? 8080);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`gateway listening on ${port}`);
};

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
