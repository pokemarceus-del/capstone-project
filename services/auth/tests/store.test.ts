import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadAuthConfig } from '../src/config.js';
import { hashCustomerRegistrationToken, hashRefreshToken, normalizeEmail } from '../src/store.js';

const testKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const testPublicJwk = testKeyPair.publicKey.export({ format: 'jwk' });
if (!testPublicJwk.n || !testPublicJwk.e) {
  throw new Error('Generated test key did not contain RSA JWK parameters.');
}
const baseConfig = {
  AUTH_DATABASE_URL: 'postgresql://aquaflow:local-password@localhost:5432/auth_db',
  JWT_ISSUER: 'aquaflow-test',
  JWT_ACTIVE_KID: 'test-key',
  JWT_PRIVATE_KEY_B64: testKeyPair.privateKey
    .export({ type: 'pkcs8', format: 'der' })
    .toString('base64'),
  JWT_PUBLIC_KEYS_JSON: JSON.stringify({
    keys: [
      {
        kty: 'RSA',
        n: testPublicJwk.n,
        e: testPublicJwk.e,
        kid: 'test-key',
        use: 'sig',
        alg: 'RS256',
      },
    ],
  }),
};

describe('Auth persistence helpers', () => {
  it('normalizes email addresses before persistence and lookup', () => {
    expect(normalizeEmail('  ADMIN@Example.Test ')).toBe('admin@example.test');
  });

  it('creates a stable, one-way refresh-token digest', () => {
    const first = hashRefreshToken('a-high-entropy-refresh-token');

    expect(first).toHaveLength(64);
    expect(first).toMatch(/^[a-f0-9]+$/);
    expect(hashRefreshToken('a-high-entropy-refresh-token')).toBe(first);
    expect(first).not.toContain('a-high-entropy-refresh-token');
  });

  it('hashes registration invitation tokens before persistence', () => {
    const token = 'a-high-entropy-registration-invitation';
    const digest = hashCustomerRegistrationToken(token);
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[a-f0-9]+$/);
    expect(digest).not.toContain(token);
    expect(hashCustomerRegistrationToken(token)).toBe(digest);
  });

  it('requires a valid PostgreSQL database URL', () => {
    expect(() =>
      loadAuthConfig({
        AUTH_DATABASE_URL: 'http://localhost/auth_db',
      }),
    ).toThrow('must be a PostgreSQL connection URL');
  });

  it('requires initial administrator credentials as a pair', () => {
    expect(() =>
      loadAuthConfig({
        ...baseConfig,
        AUTH_SEED_ADMIN_EMAIL: 'admin@example.test',
      }),
    ).toThrow('must be configured together');
  });

  it('keeps local role seeding opt-in and disabled by default', () => {
    const config = loadAuthConfig(baseConfig);
    expect(config.localIdentitySeeds).toBeUndefined();
    expect(config.customerServiceUrl).toBe('http://customer:3001');
  });

  it('requires four distinct strong credentials and non-production mode for local identities', () => {
    const localSeeds = {
      AUTH_SEED_LOCAL_IDENTITIES: 'true',
      AUTH_SEED_ADMIN_EMAIL: 'admin@example.test',
      AUTH_SEED_ADMIN_PASSWORD: 'local-admin-password-01',
      AUTH_SEED_BILLING_OFFICER_EMAIL: 'billing@example.test',
      AUTH_SEED_BILLING_OFFICER_PASSWORD: 'local-billing-password-02',
      AUTH_SEED_METER_READER_EMAIL: 'reader@example.test',
      AUTH_SEED_METER_READER_PASSWORD: 'local-reader-password-03',
      AUTH_SEED_CUSTOMER_EMAIL: 'customer@example.test',
      AUTH_SEED_CUSTOMER_PASSWORD: 'local-customer-password-04',
    };

    expect(
      loadAuthConfig({ ...baseConfig, ...localSeeds }).localIdentitySeeds?.map(({ role }) => role),
    ).toEqual(['admin', 'billing_officer', 'meter_reader', 'customer']);
    expect(() => loadAuthConfig({ ...baseConfig, NODE_ENV: 'production', ...localSeeds })).toThrow(
      'only be seeded in development or test mode',
    );
    expect(() =>
      loadAuthConfig({
        ...baseConfig,
        ...localSeeds,
        AUTH_SEED_CUSTOMER_PASSWORD: localSeeds.AUTH_SEED_METER_READER_PASSWORD,
      }),
    ).toThrow('distinct password');
    expect(() =>
      loadAuthConfig({
        ...baseConfig,
        ...localSeeds,
        AUTH_SEED_CUSTOMER_EMAIL: '',
      }),
    ).toThrow('All four local identity');
  });
});
