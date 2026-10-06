import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { AuthStore } from './store.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';
import { createUserSchema, loginSchema, refreshSchema, seedAdminSchema } from './validation.js';

const app = fastify({ logger: false });
const store = new AuthStore();

app.get('/healthz', async () => ({
  status: 'ok',
  service: 'auth',
  timestamp: new Date().toISOString(),
}));

app.get('/api/v1/info', async () => ({
  service: 'auth',
  description: 'Authentication and RBAC service',
}));

app.get('/api/v1/users', async () => {
  const users = await store.listUsers();
  return {
    items: users.map(({ passwordHash, ...user }) => user),
    count: users.length,
  };
});

app.post('/api/v1/login', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = loginSchema.parse(request.body);
  const user = await store.getUserByEmail(payload.email);

  if (!user) {
    return reply
      .code(401)
      .send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
  }

  const valid = await argon2.verify(user.passwordHash, payload.password);
  if (!valid) {
    return reply
      .code(401)
      .send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = randomUUID();
  const refreshHash = await argon2.hash(refreshToken);
  await store.createRefreshSession(user.id, refreshHash);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  };
});

app.post('/api/v1/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = refreshSchema.parse(request.body);
  const refreshHash = await argon2.hash(payload.refreshToken);
  const session = await store.findRefreshSessionByTokenHash(refreshHash);

  if (!session) {
    return reply.code(401).send({
      error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' },
    });
  }

  const user = await store.getUserById(session.userId);
  if (!user) {
    return reply.code(401).send({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
  }

  await store.revokeRefreshSession(session.id);

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return { accessToken };
});

app.post('/api/v1/users', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = createUserSchema.parse(request.body);
  const user = await store.createUser({
    email: payload.email,
    password: payload.password,
    role: payload.role,
    name: payload.name,
  });

  return reply.code(201).send({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    createdAt: user.createdAt,
  });
});

app.get('/api/v1/me', async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply
      .code(401)
      .send({ error: { code: 'UNAUTHENTICATED', message: 'Bearer token required.' } });
  }

  try {
    const token = authHeader.slice('Bearer '.length);
    const decoded = verifyAccessToken(token);
    const user = await store.getUserById(decoded.sub);

    if (!user) {
      return reply
        .code(401)
        .send({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
    }

    return { id: user.id, email: user.email, role: user.role, name: user.name };
  } catch {
    return reply
      .code(401)
      .send({ error: { code: 'INVALID_TOKEN', message: 'Token verification failed.' } });
  }
});

const start = async () => {
  const port = Number(process.env.PORT ?? 3002);
  const seedAdminEmail = process.env.AUTH_SEED_ADMIN_EMAIL;
  const seedAdminPassword = process.env.AUTH_SEED_ADMIN_PASSWORD;
  if (seedAdminEmail || seedAdminPassword) {
    const result = seedAdminSchema.safeParse({
      email: seedAdminEmail,
      password: seedAdminPassword,
    });
    if (!result.success) {
      throw new Error(
        `Invalid initial administrator configuration: ${result.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    }
    await store.seedAdmin(result.data.email, result.data.password);
  }

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`auth service listening on ${port}`);
};

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
