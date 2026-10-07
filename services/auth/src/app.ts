import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AccessTokenVerificationError, type AuthTokenPayload } from '@aquaflow/authentication';
import type { AuthConfig } from './config.js';
import {
  CustomerDirectory,
  CustomerDirectoryConflictError,
  CustomerDirectoryNotFoundError,
  CustomerDirectoryUnavailableError,
} from './customer-directory.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';
import type { User } from './types.js';
import {
  AuthEmailConflictError,
  AuthStore,
  hashCustomerRegistrationToken,
  hashRefreshToken,
  InvalidCustomerRegistrationInvitationError,
  normalizeEmail,
} from './store.js';
import {
  createUserSchema,
  customerInvitationSchema,
  customerRegistrationSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
} from './validation.js';

export interface CustomerDirectoryVerifier {
  getVerifiedCustomer(
    customerId: string,
    authorization: string,
  ): Promise<{ customerId: string; email: string; name: string; accountIds: string[] }>;
}

export function createAuthApp(
  store: AuthStore,
  config: AuthConfig,
  customerDirectory: CustomerDirectoryVerifier = new CustomerDirectory(config.customerServiceUrl),
): FastifyInstance {
  const app = fastify({
    logger: {
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        censor: '[REDACTED]',
      },
    },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: error.issues,
        },
      });
    }
    if (error instanceof AuthEmailConflictError) {
      return reply
        .code(409)
        .send({ error: { code: 'EMAIL_ALREADY_EXISTS', message: error.message } });
    }
    if (error instanceof InvalidCustomerRegistrationInvitationError) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_REGISTRATION_INVITATION',
          message: 'The registration invitation is invalid, expired, or already used.',
        },
      });
    }
    if (error instanceof CustomerDirectoryNotFoundError) {
      return reply
        .code(404)
        .send({ error: { code: 'CUSTOMER_NOT_FOUND', message: error.message } });
    }
    if (error instanceof CustomerDirectoryConflictError) {
      return reply
        .code(409)
        .send({ error: { code: 'CUSTOMER_NOT_ELIGIBLE', message: error.message } });
    }
    if (error instanceof CustomerDirectoryUnavailableError) {
      return reply.code(503).send({
        error: { code: 'CUSTOMER_VERIFICATION_UNAVAILABLE', message: error.message },
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  });

  const authenticateAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const authorization = request.headers.authorization;
    const bearer = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!bearer) {
      await store.recordSecurityAuditEvent({
        action: 'auth.admin_endpoint.denied',
        outcome: 'DENIED',
        targetType: 'endpoint',
        targetId: request.routeOptions.url,
      });
      reply.code(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
      });
      return undefined;
    }

    let claims: AuthTokenPayload;
    try {
      claims = verifyAccessToken(bearer[1], config.jwt);
    } catch (error) {
      if (!(error instanceof AccessTokenVerificationError)) {
        throw error;
      }
      await store.recordSecurityAuditEvent({
        action: 'auth.admin_endpoint.denied',
        outcome: 'DENIED',
        targetType: 'endpoint',
        targetId: request.routeOptions.url,
      });
      reply.code(401).send({
        error: { code: 'INVALID_TOKEN', message: 'Token verification failed.' },
      });
      return undefined;
    }
    if (claims.role !== 'admin') {
      await store.recordSecurityAuditEvent({
        action: 'auth.admin_endpoint.denied',
        outcome: 'DENIED',
        actorUserId: claims.sub,
        targetType: 'endpoint',
        targetId: request.routeOptions.url,
      });
      reply.code(403).send({
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Administrator access is required.' },
      });
      return undefined;
    }

    return { claims, authorization: bearer[0] };
  };

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'auth',
    timestamp: new Date().toISOString(),
  }));

  app.get('/readyz', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await store.checkReady();
      return { status: 'ok', service: 'auth', timestamp: new Date().toISOString() };
    } catch (error) {
      app.log.error(error, 'Auth readiness check failed');
      return reply.code(503).send({ status: 'unavailable', service: 'auth' });
    }
  });

  app.get('/api/v1/info', async () => ({
    service: 'auth',
    description: 'Authentication and RBAC service',
  }));

  app.get('/.well-known/jwks.json', async () => config.jwt.jwks);

  app.get('/api/v1/users', async (request, reply) => {
    const authenticated = await authenticateAdmin(request, reply);
    if (!authenticated) {
      return;
    }
    const users = await store.listUsers();
    await store.recordSecurityAuditEvent({
      action: 'auth.user_directory.read',
      outcome: 'SUCCESS',
      actorUserId: authenticated.claims.sub,
      targetType: 'endpoint',
      targetId: request.routeOptions.url,
    });
    return {
      items: users.map(({ passwordHash, ...user }) => user),
      count: users.length,
    };
  });

  app.get('/api/v1/audit-events', async (request, reply) => {
    const authenticated = await authenticateAdmin(request, reply);
    if (!authenticated) {
      return;
    }
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
      .parse(request.query);
    const items = await store.listSecurityAuditEvents(limit);
    await store.recordSecurityAuditEvent({
      action: 'auth.audit_events.read',
      outcome: 'SUCCESS',
      actorUserId: authenticated.claims.sub,
      targetType: 'endpoint',
      targetId: request.routeOptions.url,
    });
    return { items, count: items.length };
  });

  app.post('/api/v1/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = loginSchema.parse(request.body);
    const email = normalizeEmail(payload.email);
    const user = await store.getUserByEmail(email);
    const failedAttempts = await store.countConsecutiveRecentLoginFailures(
      email,
      new Date(Date.now() - 15 * 60 * 1000),
      5,
    );

    if (failedAttempts >= 5) {
      await store.recordSecurityAuditEvent({
        action: 'auth.login.locked',
        outcome: 'DENIED',
        targetType: 'login',
      });
      return reply
        .code(401)
        .send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }

    if (!user) {
      await store.recordLoginEvent({ email, outcome: 'FAILURE' });
      return reply
        .code(401)
        .send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }

    const valid = await argon2.verify(user.passwordHash, payload.password);
    if (!valid || (user.role === 'customer' && !user.emailVerifiedAt)) {
      await store.recordLoginEvent({ userId: user.id, email, outcome: 'FAILURE' });
      return reply
        .code(401)
        .send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }

    await store.recordLoginEvent({ userId: user.id, email, outcome: 'SUCCESS' });
    const accessToken = signAccessToken(
      { sub: user.id, email: user.email, role: user.role },
      config.jwt,
    );
    const refreshToken = randomBytes(32).toString('base64url');
    await store.createRefreshSession(user.id, hashRefreshToken(refreshToken));

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
  });

  app.post('/api/v1/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = refreshSchema.parse(request.body);
    const replacementRefreshToken = randomBytes(32).toString('base64url');
    const rotation = await store.rotateRefreshSession(
      hashRefreshToken(payload.refreshToken),
      hashRefreshToken(replacementRefreshToken),
    );

    if (rotation.status !== 'rotated') {
      return reply.code(401).send({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' },
      });
    }

    const user = await store.getUserById(rotation.session.userId);
    if (!user || (user.role === 'customer' && !user.emailVerifiedAt)) {
      await store.revokeRefreshSessionByTokenHash(hashRefreshToken(replacementRefreshToken));
      return reply.code(401).send({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' },
      });
    }

    const accessToken = signAccessToken(
      { sub: user.id, email: user.email, role: user.role },
      config.jwt,
    );
    return { accessToken, refreshToken: replacementRefreshToken };
  });

  app.post('/api/v1/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = logoutSchema.parse(request.body);
    await store.recordLogoutByTokenHash(hashRefreshToken(payload.refreshToken));
    return reply.code(204).send();
  });

  app.post('/api/v1/customer-invitations', async (request, reply) => {
    const authenticated = await authenticateAdmin(request, reply);
    if (!authenticated) {
      return;
    }
    const payload = customerInvitationSchema.parse(request.body);
    const customer = await customerDirectory.getVerifiedCustomer(
      payload.customerId,
      authenticated.authorization,
    );
    const invitationToken = randomBytes(32).toString('base64url');
    const invitation = await store.createCustomerRegistrationInvitation({
      tokenHash: hashCustomerRegistrationToken(invitationToken),
      email: customer.email,
      name: customer.name,
      customerId: customer.customerId,
      accountIds: customer.accountIds,
      createdByUserId: authenticated.claims.sub,
    });
    return reply.code(201).send({
      email: customer.email,
      invitationToken,
      expiresAt: invitation.expiresAt,
    });
  });

  app.post('/api/v1/register', async (request, reply) => {
    const payload = customerRegistrationSchema.parse(request.body);
    let user: User;
    try {
      user = await store.redeemCustomerRegistrationInvitation({
        tokenHash: hashCustomerRegistrationToken(payload.invitationToken),
        password: payload.password,
      });
    } catch (error) {
      if (!(error instanceof InvalidCustomerRegistrationInvitationError)) {
        throw error;
      }
      await store.recordSecurityAuditEvent({
        action: 'customer.registration.rejected',
        outcome: 'DENIED',
        targetType: 'registration_invitation',
      });
      throw error;
    }
    return reply.code(201).send({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      emailVerifiedAt: user.emailVerifiedAt,
    });
  });

  app.post('/api/v1/users', async (request, reply) => {
    const authenticated = await authenticateAdmin(request, reply);
    if (!authenticated) {
      return;
    }
    const payload = createUserSchema.parse(request.body);
    const user = await store.createUser({
      email: payload.email,
      password: payload.password,
      role: payload.role,
      name: payload.name,
      createdByUserId: authenticated.claims.sub,
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
    const authorization = request.headers.authorization;
    const bearer = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!bearer) {
      return reply
        .code(401)
        .send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } });
    }

    let decoded: AuthTokenPayload;
    try {
      decoded = verifyAccessToken(bearer[1], config.jwt);
    } catch (error) {
      if (!(error instanceof AccessTokenVerificationError)) {
        throw error;
      }
      return reply
        .code(401)
        .send({ error: { code: 'INVALID_TOKEN', message: 'Token verification failed.' } });
    }

    const user = await store.getUserById(decoded.sub);
    if (!user) {
      return reply
        .code(401)
        .send({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
    }
    return { id: user.id, email: user.email, role: user.role, name: user.name };
  });

  return app;
}
