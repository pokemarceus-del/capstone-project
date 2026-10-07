import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { customerRouteMethods, publicCustomerRoutes } from '../src/permissions.js';
import { CustomerStore } from '../src/store.js';
import { jwtConfig, tokenForRole } from './jwt-fixture.js';

const integrationDatabaseUrl = process.env.CUSTOMER_INTEGRATION_DATABASE_URL;

if (integrationDatabaseUrl) {
  const parsedUrl = new URL(integrationDatabaseUrl);
  const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
    !databaseName.endsWith('_test')
  ) {
    throw new Error(
      'CUSTOMER_INTEGRATION_DATABASE_URL must point to a PostgreSQL database whose name ends in "_test".',
    );
  }
}

const integrationDescribe = integrationDatabaseUrl ? describe : describe.skip;

integrationDescribe('Customer Service PostgreSQL integration', () => {
  let prisma!: PrismaClient;
  let store!: CustomerStore;
  let accountId: string | undefined;
  let customerId: string | undefined;
  let serviceAddressId: string | undefined;
  let zoneId: string | undefined;
  let meterIds: string[] = [];

  beforeAll(async () => {
    if (!integrationDatabaseUrl) {
      throw new Error('CUSTOMER_INTEGRATION_DATABASE_URL is required.');
    }
    prisma = new PrismaClient({
      datasources: { db: { url: integrationDatabaseUrl } },
    });
    await prisma.$connect();
    store = new CustomerStore(prisma);
  });

  beforeEach(async () => {
    meterIds = [];
    accountId = undefined;
    customerId = undefined;
    serviceAddressId = undefined;
    zoneId = undefined;
    const suffix = randomUUID();
    const fixture = await prisma.$transaction(async (transaction) => {
      const zone = await transaction.zone.create({
        data: { name: `integration-${suffix}` },
      });
      const customer = await transaction.customer.create({
        data: {
          name: 'Integration Test Customer',
          email: `integration-${suffix}@aquaflow.local`,
          phone: '+1-555-0199',
        },
      });
      const serviceAddress = await transaction.serviceAddress.create({
        data: { addressLine: '99 Integration Test Avenue', zoneId: zone.id },
      });
      const account = await transaction.account.create({
        data: {
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          classification: 'RESIDENTIAL',
        },
      });

      return { zone, customer, serviceAddress, account };
    });

    zoneId = fixture.zone.id;
    customerId = fixture.customer.id;
    serviceAddressId = fixture.serviceAddress.id;
    accountId = fixture.account.id;
  });

  afterEach(async () => {
    if (accountId) {
      await prisma.meterInstallation.deleteMany({ where: { accountId } });
    }
    if (meterIds.length > 0) {
      await prisma.meter.deleteMany({ where: { id: { in: meterIds } } });
    }
    if (accountId) {
      await prisma.account.deleteMany({ where: { id: accountId } });
    }
    if (serviceAddressId) {
      await prisma.serviceAddress.deleteMany({ where: { id: serviceAddressId } });
    }
    if (customerId) {
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
    if (zoneId) {
      await prisma.zone.deleteMany({ where: { id: zoneId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists account activation and deactivation', async () => {
    if (!accountId) {
      throw new Error('The integration account fixture was not created.');
    }

    const deactivated = await store.setAccountStatus(accountId, 'inactive');
    const reactivated = await store.setAccountStatus(accountId, 'active');
    const persisted = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });

    expect(deactivated.status).toBe('inactive');
    expect(reactivated.status).toBe('active');
    expect(persisted.status).toBe('ACTIVE');
  });

  it('reports database readiness and serves the OpenAPI document', async () => {
    const openApiDocument: unknown = JSON.parse(
      await readFile(new URL('../openapi.json', import.meta.url), 'utf8'),
    );
    const app = createApp(
      store,
      async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      'silent',
      openApiDocument,
      jwtConfig,
    );

    const readiness = await app.inject({
      method: 'GET',
      url: '/readyz',
      headers: { 'x-request-id': 'readiness-test-request' },
    });
    const openApi = await app.inject({ method: 'GET', url: '/openapi.json' });
    await app.close();

    expect(readiness.statusCode).toBe(200);
    expect(readiness.headers['x-request-id']).toBe('readiness-test-request');
    expect(readiness.json()).toMatchObject({
      status: 'ok',
      service: 'customer',
      dependencies: { database: 'ok' },
    });
    expect(openApi.statusCode).toBe(200);
    expect(openApi.json().openapi).toBe('3.1.0');
    expect(openApi.json().paths['/api/v1/accounts/{id}/meters']).toBeDefined();
  });

  it('authenticates Customer Service routes and enforces the role permission matrix', async () => {
    const app = createApp(store, async () => {}, 'silent', {}, jwtConfig);
    const customerCollection = '/api/v1/customers';
    const unauthenticated = await app.inject({ method: 'GET', url: customerCollection });
    const invalidToken = await app.inject({
      method: 'GET',
      url: customerCollection,
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    const billingRead = await app.inject({
      method: 'GET',
      url: customerCollection,
      headers: { authorization: `Bearer ${tokenForRole('billing_officer')}` },
    });
    const billingWrite = await app.inject({
      method: 'POST',
      url: customerCollection,
      headers: { authorization: `Bearer ${tokenForRole('billing_officer')}` },
      payload: {},
    });
    const adminWrite = await app.inject({
      method: 'POST',
      url: customerCollection,
      headers: { authorization: `Bearer ${tokenForRole('admin')}` },
      payload: {},
    });
    const readerRead = await app.inject({
      method: 'GET',
      url: customerCollection,
      headers: { authorization: `Bearer ${tokenForRole('meter_reader')}` },
    });
    const customerRead = await app.inject({
      method: 'GET',
      url: customerCollection,
      headers: { authorization: `Bearer ${tokenForRole('customer')}` },
    });
    const health = await app.inject({ method: 'GET', url: '/healthz' });
    const openApi = await app.inject({ method: 'GET', url: '/openapi.json' });
    await app.close();

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json().error.code).toBe('UNAUTHENTICATED');
    expect(invalidToken.statusCode).toBe(401);
    expect(invalidToken.json().error.code).toBe('INVALID_TOKEN');
    expect(billingRead.statusCode).toBe(200);
    expect(billingWrite.statusCode).toBe(403);
    expect(billingWrite.json().error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(adminWrite.statusCode).toBe(400);
    expect(readerRead.statusCode).toBe(403);
    expect(customerRead.statusCode).toBe(403);
    expect(health.statusCode).toBe(200);
    expect(openApi.statusCode).toBe(200);
  });

  it('checks every Customer API method against every role at the HTTP boundary', async () => {
    const app = createApp(store, async () => {}, 'silent', {}, jwtConfig);
    const roles = ['admin', 'billing_officer', 'customer', 'meter_reader'] as const;
    const methods = ['GET', 'POST', 'PATCH'] as const;
    const deniedStatuses = new Set([401, 403]);

    for (const [routeTemplate, routeMethods] of Object.entries(customerRouteMethods)) {
      const url = routeTemplate.replace(':id', 'not-a-uuid');
      for (const method of methods.filter((candidate) => routeMethods.includes(candidate))) {
        const payload = method === 'POST' || method === 'PATCH' ? {} : undefined;
        const anonymous = await app.inject({ method, url, payload });
        expect(anonymous.statusCode).toBe(401);

        for (const role of roles) {
          const response = await app.inject({
            method,
            url,
            headers: { authorization: `Bearer ${tokenForRole(role)}` },
            payload,
          });
          const allowed =
            role === 'admin' ||
            (role === 'billing_officer' && method === 'GET' && routeMethods.includes('GET'));
          if (allowed) {
            expect(deniedStatuses.has(response.statusCode)).toBe(false);
          } else {
            expect(response.statusCode).toBe(403);
          }
        }
      }
    }

    const publicResponses = await Promise.all(
      publicCustomerRoutes.map((url) => app.inject({ method: 'GET', url })),
    );
    await app.close();
    expect(publicResponses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
  });

  it('returns 503 with a controlled response when the database readiness check fails', async () => {
    const openApiDocument: unknown = JSON.parse(
      await readFile(new URL('../openapi.json', import.meta.url), 'utf8'),
    );
    const app = createApp(
      store,
      async () => {
        throw new Error('internal database connection details');
      },
      'silent',
      openApiDocument,
      jwtConfig,
    );

    const response = await app.inject({ method: 'GET', url: '/readyz' });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Database is unavailable.' },
      dependencies: { database: 'unavailable' },
    });
    expect(response.body).not.toContain('internal database connection details');
  });

  it('enforces one active meter installation per account in PostgreSQL', async () => {
    if (!accountId) {
      throw new Error('The integration account fixture was not created.');
    }

    const firstMeter = await store.installMeter({
      accountId,
      serialNumber: `IT-${randomUUID()}`,
      size: '0.5',
      registerDigits: 6,
      currentReading: 10,
      status: 'active',
    });
    meterIds.push(firstMeter.id);

    const conflictingMeter = await prisma.meter.create({
      data: {
        serialNumber: `IT-${randomUUID()}`,
        size: '0.5',
        registerDigits: 6,
      },
    });
    meterIds.push(conflictingMeter.id);

    await expect(
      prisma.meterInstallation.create({
        data: {
          accountId,
          meterId: conflictingMeter.id,
          installedAt: new Date(),
          initialRegisterValue: 0,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces unique meter serial numbers in PostgreSQL', async () => {
    const serialNumber = `IT-${randomUUID()}`;
    const firstMeter = await prisma.meter.create({
      data: { serialNumber, size: '0.5', registerDigits: 6 },
    });
    meterIds.push(firstMeter.id);

    await expect(
      prisma.meter.create({
        data: { serialNumber, size: '0.5', registerDigits: 6 },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('stores old final and new initial readings separately in replacement history', async () => {
    if (!accountId) {
      throw new Error('The integration account fixture was not created.');
    }

    const oldMeter = await store.installMeter({
      accountId,
      serialNumber: `IT-${randomUUID()}`,
      size: '0.5',
      registerDigits: 6,
      currentReading: 125.25,
      status: 'active',
    });
    meterIds.push(oldMeter.id);

    const replacementAt = new Date(Date.now() + 60_000).toISOString();
    const replacement = await store.replaceMeter({
      accountId,
      oldMeterId: oldMeter.id,
      finalReading: 130.75,
      replacementAt,
      newMeter: {
        id: randomUUID(),
        accountId,
        serialNumber: `IT-${randomUUID()}`,
        size: '0.5',
        registerDigits: 6,
        currentReading: 2.5,
        status: 'active',
        installedAt: replacementAt,
        replacedAt: null,
      },
    });
    meterIds.push(replacement.id);

    const history = await store.listAccountMeterHistory(accountId);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      meterId: oldMeter.id,
      status: 'retired',
      initialReading: 125.25,
      finalReading: 130.75,
      removedAt: replacementAt,
    });
    expect(history[1]).toMatchObject({
      meterId: replacement.id,
      status: 'active',
      initialReading: 2.5,
      finalReading: null,
    });
  });
});
