import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { CustomerConflictError } from '../src/errors.js';
import {
  assertCanInstallMeter,
  assertCanReplaceMeter,
  createReplacementRegisterValues,
} from '../src/meter-lifecycle.js';
import { buildCustomerSeedData, seedZones } from '../src/seed-data.js';
import {
  accountListQuerySchema,
  accountStatusSchema,
  customerListQuerySchema,
  meterInstallSchema,
  meterReplacementSchema,
} from '../src/validation.js';

describe('Customer Service configuration', () => {
  it('loads validated defaults and a PostgreSQL connection URL', () => {
    expect(
      loadConfig({
        CUSTOMER_DATABASE_URL: 'postgresql://aquaflow:secret@localhost:5432/customer_db',
      }),
    ).toEqual({
      port: 3001,
      logLevel: 'info',
      databaseUrl: 'postgresql://aquaflow:secret@localhost:5432/customer_db',
      seedDemoData: false,
    });
  });

  it('rejects a missing or non-PostgreSQL connection URL', () => {
    expect(() => loadConfig({})).toThrow('CUSTOMER_DATABASE_URL');
    expect(() => loadConfig({ CUSTOMER_DATABASE_URL: 'mysql://localhost/customer_db' })).toThrow(
      'must use a PostgreSQL connection URL',
    );
  });

  it('rejects invalid port and seed settings', () => {
    expect(() =>
      loadConfig({
        PORT: '70000',
        CUSTOMER_DATABASE_URL: 'postgresql://localhost/customer_db',
      }),
    ).toThrow('PORT');
    expect(() =>
      loadConfig({
        CUSTOMER_DATABASE_URL: 'postgresql://localhost/customer_db',
        CUSTOMER_SEED_DEMO: 'yes',
      }),
    ).toThrow('CUSTOMER_SEED_DEMO');
    expect(() =>
      loadConfig({
        CUSTOMER_DATABASE_URL: 'postgresql://localhost/customer_db',
        LOG_LEVEL: 'verbose',
      }),
    ).toThrow('LOG_LEVEL');
  });

  it('accepts a configured structured logging level', () => {
    expect(
      loadConfig({
        CUSTOMER_DATABASE_URL: 'postgresql://localhost/customer_db',
        LOG_LEVEL: 'debug',
      }).logLevel,
    ).toBe('debug');
  });
});

describe('meter lifecycle validation', () => {
  const installInput = {
    accountId: '00000000-0000-4000-8000-000000000001',
    serialNumber: 'METER-001',
    size: '0.5',
    registerDigits: 6,
    currentReading: 100,
    status: 'active' as const,
  };

  it('requires a valid register digit count for installation and replacement', () => {
    expect(meterInstallSchema.safeParse(installInput).success).toBe(true);
    expect(meterInstallSchema.safeParse({ ...installInput, registerDigits: 0 }).success).toBe(
      false,
    );

    expect(
      meterReplacementSchema.safeParse({
        accountId: installInput.accountId,
        oldMeterId: installInput.accountId,
        newSerialNumber: 'METER-002',
        newSize: '0.5',
        registerDigits: 6,
        finalReading: 125,
        currentReading: 3,
      }).success,
    ).toBe(true);
  });

  it('rejects another active installation and a duplicate serial number', () => {
    expect(() =>
      assertCanInstallMeter({
        accountHasActiveMeter: true,
        serialNumberAlreadyExists: false,
      }),
    ).toThrow(CustomerConflictError);
    expect(() =>
      assertCanInstallMeter({
        accountHasActiveMeter: false,
        serialNumberAlreadyExists: true,
      }),
    ).toThrow('Meter serial number is already registered.');
  });

  it('rejects a replacement final reading below the prior register value', () => {
    expect(() =>
      assertCanReplaceMeter({
        oldMeterIsCurrent: true,
        serialNumberAlreadyExists: false,
        previousRegisterValue: new Prisma.Decimal(100),
        finalRegisterValue: new Prisma.Decimal(99),
      }),
    ).toThrow('Final reading cannot be lower than the previous reading.');
  });

  it('allows a valid replacement lifecycle', () => {
    expect(() =>
      assertCanReplaceMeter({
        oldMeterIsCurrent: true,
        serialNumberAlreadyExists: false,
        previousRegisterValue: new Prisma.Decimal(100),
        finalRegisterValue: new Prisma.Decimal(125),
      }),
    ).not.toThrow();
  });

  it('keeps the old final register separate from the replacement initial register', () => {
    const readings = createReplacementRegisterValues(125.25, 3.125);

    expect(readings.oldMeterFinalRegisterValue.toString()).toBe('125.25');
    expect(readings.newMeterInitialRegisterValue.toString()).toBe('3.125');
  });
});

describe('Customer Service listing and account status validation', () => {
  it('provides stable pagination defaults and validates page sizes', () => {
    expect(customerListQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(accountListQuerySchema.parse({ page: '2', limit: '50', zone: 'North' })).toEqual({
      page: 2,
      limit: 50,
      zone: 'North',
    });
    expect(accountListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('accepts supported customer/account filters and rejects empty search text', () => {
    expect(customerListQuerySchema.safeParse({ q: 'demo', status: 'active' }).success).toBe(true);
    expect(
      accountListQuerySchema.safeParse({
        q: 'Riverbend',
        status: 'inactive',
        classification: 'Residential',
      }).success,
    ).toBe(true);
    expect(accountListQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
  });

  it('permits explicit account reactivation and deactivation only', () => {
    expect(accountStatusSchema.safeParse({ status: 'inactive' }).success).toBe(true);
    expect(accountStatusSchema.safeParse({ status: 'active' }).success).toBe(true);
    expect(accountStatusSchema.safeParse({ status: 'archived' }).success).toBe(false);
  });
});

describe('deterministic Customer Service seed', () => {
  it('contains the exact plan target counts with deterministic IDs', () => {
    const seed = buildCustomerSeedData();
    const repeatedSeed = buildCustomerSeedData();

    expect(seedZones).toHaveLength(3);
    expect(seed.customers).toHaveLength(60);
    expect(seed.accounts).toHaveLength(75);
    expect(seed.meters).toHaveLength(80);
    expect(seed.installations).toHaveLength(80);
    expect(seed.customers.map(({ id }) => id)).toEqual(repeatedSeed.customers.map(({ id }) => id));
    expect(seed.accounts.map(({ id }) => id)).toEqual(repeatedSeed.accounts.map(({ id }) => id));
    expect(seed.meters.map(({ id }) => id)).toEqual(repeatedSeed.meters.map(({ id }) => id));
  });

  it('assigns every account to one customer and one zone with 75 current meters', () => {
    const seed = buildCustomerSeedData();
    const customerIds = new Set(seed.customers.map(({ id }) => id));
    const zoneIds = new Set(seedZones.map(({ id }) => id));
    const accountIds = new Set(seed.accounts.map(({ id }) => id));
    const meterIds = new Set(seed.meters.map(({ id }) => id));
    const currentInstallations = seed.installations.filter(
      ({ removedAt }) => removedAt === null || removedAt === undefined,
    );

    expect(new Set(seed.accounts.map(({ customerId }) => customerId)).size).toBe(60);
    expect(seed.accounts.every(({ customerId }) => customerIds.has(customerId))).toBe(true);
    expect(seed.addresses.every(({ zoneId }) => zoneIds.has(zoneId))).toBe(true);
    expect(
      seed.accounts.every(({ serviceAddressId }) =>
        seed.addresses.some(({ id }) => id === serviceAddressId),
      ),
    ).toBe(true);
    expect(
      seed.installations.every(
        ({ accountId, meterId }) => accountIds.has(accountId) && meterIds.has(meterId),
      ),
    ).toBe(true);
    expect(seed.meters.filter(({ status }) => status === 'ACTIVE')).toHaveLength(75);
    expect(new Set(currentInstallations.map(({ accountId }) => accountId)).size).toBe(75);
    expect(currentInstallations.every(({ accountId }) => accountIds.has(accountId))).toBe(true);
    expect(
      seed.installations.filter(({ removedAt }) => removedAt !== null && removedAt !== undefined),
    ).toHaveLength(5);
  });

  it('preserves replacement seed readings in separate installation records', () => {
    const seed = buildCustomerSeedData();
    const retiredInstallation = seed.installations.find(({ removedAt }) => removedAt);
    const activeReplacement = seed.installations.find(
      ({ accountId, removedAt }) => accountId === retiredInstallation?.accountId && !removedAt,
    );

    expect(retiredInstallation?.finalRegisterValue?.toString()).toBe('151');
    expect(activeReplacement?.initialRegisterValue.toString()).toBe('10');
  });
});
