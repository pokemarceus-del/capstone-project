import { randomUUID } from 'node:crypto';
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AccessTokenVerificationError,
  verifyAccessToken,
  type JwtVerificationConfig,
} from '@aquaflow/authentication';
import { CustomerConflictError, CustomerNotFoundError } from './errors.js';
import { canAccessCustomerRoute, isPublicCustomerRoute } from './permissions.js';
import { CustomerStore } from './store.js';
import {
  accountListQuerySchema,
  accountSchema,
  accountStatusSchema,
  customerSchema,
  customerListQuerySchema,
  meterInstallSchema,
  meterReplacementSchema,
} from './validation.js';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export function createApp(
  store: CustomerStore,
  checkDatabase: () => Promise<void>,
  logLevel: LogLevel,
  openApiDocument: unknown,
  jwtConfig: JwtVerificationConfig,
): FastifyInstance {
  const app = fastify({
    logger: {
      level: logLevel,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        censor: '[REDACTED]',
      },
    },
    requestIdHeader: 'x-request-id',
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode === 401 || reply.statusCode === 403) {
      request.log.warn(
        {
          event: 'authorization.denied',
          method: request.method,
          route: request.routeOptions.url,
          statusCode: reply.statusCode,
        },
        'Customer API authorization denied',
      );
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    if (isPublicCustomerRoute(request.routeOptions.url)) {
      return;
    }

    const authorization = request.headers.authorization;
    const bearer = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!bearer) {
      return reply.code(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
      });
    }

    let claims;
    try {
      claims = verifyAccessToken(bearer[1], jwtConfig);
    } catch (error) {
      if (!(error instanceof AccessTokenVerificationError)) {
        throw error;
      }
      return reply.code(401).send({
        error: { code: 'INVALID_TOKEN', message: 'Token verification failed.' },
      });
    }

    if (!canAccessCustomerRoute(claims.role, request.method, request.routeOptions.url)) {
      return reply.code(403).send({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You are not allowed to perform this action.',
        },
      });
    }
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

    if (error instanceof CustomerNotFoundError) {
      return reply.code(404).send({
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof CustomerConflictError) {
      const code =
        request.routeOptions.url === '/api/v1/meters/install'
          ? 'METER_INSTALLATION_FAILED'
          : request.routeOptions.url === '/api/v1/meters/replace'
            ? 'METER_REPLACEMENT_FAILED'
            : 'CUSTOMER_CONFLICT';
      return reply.code(409).send({ error: { code, message: error.message } });
    }

    request.log.error(error);
    return reply.code(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  });

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'customer',
    timestamp: new Date().toISOString(),
  }));

  app.get('/readyz', async (request, reply) => {
    try {
      await checkDatabase();
      return {
        status: 'ok',
        service: 'customer',
        dependencies: { database: 'ok' },
      };
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed');
      return reply.code(503).send({
        error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Database is unavailable.' },
        dependencies: { database: 'unavailable' },
      });
    }
  });

  app.get('/openapi.json', async () => openApiDocument);

  app.get('/api/v1/info', async () => ({
    service: 'customer',
    description: 'Customer and meter management service',
  }));

  app.get('/api/v1/customers', async (request) => {
    const query = customerListQuerySchema.parse(request.query);
    return store.listCustomers(query);
  });

  app.get(
    '/api/v1/customers/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const customer = await store.getCustomer(id);

      if (!customer) {
        return reply
          .code(404)
          .send({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' } });
      }

      return customer;
    },
  );

  app.post('/api/v1/customers', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = customerSchema.parse(request.body);
    const customer = await store.createCustomer({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      status: payload.status,
    });

    return reply.code(201).send(customer);
  });

  app.get('/api/v1/accounts', async (request) => {
    const query = accountListQuerySchema.parse(request.query);
    return store.listAccounts(query);
  });

  app.patch(
    '/api/v1/accounts/:id/status',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const { status } = accountStatusSchema.parse(request.body);
      const account = await store.setAccountStatus(id, status);
      return reply.send(account);
    },
  );

  app.get(
    '/api/v1/accounts/:id/meters',
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const items = await store.listAccountMeterHistory(id);
      return { items, count: items.length };
    },
  );

  app.post('/api/v1/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = accountSchema.parse(request.body);
    const account = await store.createAccount({
      customerId: payload.customerId,
      address: payload.address,
      zone: payload.zone,
      classification: payload.classification,
      status: payload.status,
      activeMeterId: null,
    });

    return reply.code(201).send(account);
  });

  app.get('/api/v1/meters', async () => {
    const items = await store.listMeters();
    return { items, count: items.length };
  });

  app.post('/api/v1/meters/install', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = meterInstallSchema.parse(request.body);
    const meter = await store.installMeter({
      accountId: payload.accountId,
      serialNumber: payload.serialNumber,
      size: payload.size,
      registerDigits: payload.registerDigits,
      currentReading: payload.currentReading,
      status: payload.status,
    });

    return reply.code(201).send(meter);
  });

  app.post('/api/v1/meters/replace', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = meterReplacementSchema.parse(request.body);
    const newMeter = {
      id: randomUUID(),
      accountId: payload.accountId,
      serialNumber: payload.newSerialNumber,
      size: payload.newSize,
      registerDigits: payload.registerDigits,
      currentReading: payload.currentReading,
      status: 'active' as const,
      installedAt: payload.replacementAt ?? new Date().toISOString(),
      replacedAt: null,
    };

    const meter = await store.replaceMeter({
      accountId: payload.accountId,
      oldMeterId: payload.oldMeterId,
      finalReading: payload.finalReading,
      replacementAt: payload.replacementAt,
      newMeter,
    });

    return reply.code(201).send(meter);
  });

  return app;
}
