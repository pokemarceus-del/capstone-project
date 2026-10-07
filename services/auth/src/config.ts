import { z } from 'zod';
import { loadJwtConfig } from './jwt.js';

const authConfigSchema = z.object({
  AUTH_DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
      message: 'must be a PostgreSQL connection URL',
    }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  NODE_ENV: z.string().default('development'),
  CUSTOMER_SERVICE_URL: z.string().url().default('http://customer:3001'),
  AUTH_SEED_ADMIN_EMAIL: z.union([z.string().email(), z.literal('')]).optional(),
  AUTH_SEED_ADMIN_PASSWORD: z.union([z.string().min(8).max(128), z.literal('')]).optional(),
  AUTH_SEED_LOCAL_IDENTITIES: z.enum(['true', 'false']).default('false'),
  AUTH_SEED_BILLING_OFFICER_EMAIL: z.union([z.string().email(), z.literal('')]).optional(),
  AUTH_SEED_BILLING_OFFICER_PASSWORD: z
    .union([z.string().min(16).max(128), z.literal('')])
    .optional(),
  AUTH_SEED_METER_READER_EMAIL: z.union([z.string().email(), z.literal('')]).optional(),
  AUTH_SEED_METER_READER_PASSWORD: z.union([z.string().min(16).max(128), z.literal('')]).optional(),
  AUTH_SEED_CUSTOMER_EMAIL: z.union([z.string().email(), z.literal('')]).optional(),
  AUTH_SEED_CUSTOMER_PASSWORD: z.union([z.string().min(16).max(128), z.literal('')]).optional(),
});

export interface LocalIdentitySeed {
  email: string;
  password: string;
  role: 'admin' | 'billing_officer' | 'meter_reader' | 'customer';
  name: string;
}

export interface AuthConfig {
  databaseUrl: string;
  port: number;
  customerServiceUrl: string;
  seedAdminEmail?: string;
  seedAdminPassword?: string;
  localIdentitySeeds?: LocalIdentitySeed[];
  jwt: ReturnType<typeof loadJwtConfig>;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const result = authConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `Invalid Auth Service configuration: ${result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const {
    AUTH_DATABASE_URL,
    PORT,
    NODE_ENV,
    CUSTOMER_SERVICE_URL,
    AUTH_SEED_ADMIN_EMAIL,
    AUTH_SEED_ADMIN_PASSWORD,
    AUTH_SEED_LOCAL_IDENTITIES,
    AUTH_SEED_BILLING_OFFICER_EMAIL,
    AUTH_SEED_BILLING_OFFICER_PASSWORD,
    AUTH_SEED_METER_READER_EMAIL,
    AUTH_SEED_METER_READER_PASSWORD,
    AUTH_SEED_CUSTOMER_EMAIL,
    AUTH_SEED_CUSTOMER_PASSWORD,
  } = result.data;
  if (Boolean(AUTH_SEED_ADMIN_EMAIL) !== Boolean(AUTH_SEED_ADMIN_PASSWORD)) {
    throw new Error(
      'AUTH_SEED_ADMIN_EMAIL and AUTH_SEED_ADMIN_PASSWORD must be configured together.',
    );
  }

  const localRoleCredentials = [
    AUTH_SEED_ADMIN_EMAIL,
    AUTH_SEED_ADMIN_PASSWORD,
    AUTH_SEED_BILLING_OFFICER_EMAIL,
    AUTH_SEED_BILLING_OFFICER_PASSWORD,
    AUTH_SEED_METER_READER_EMAIL,
    AUTH_SEED_METER_READER_PASSWORD,
    AUTH_SEED_CUSTOMER_EMAIL,
    AUTH_SEED_CUSTOMER_PASSWORD,
  ];
  let localIdentitySeeds: LocalIdentitySeed[] | undefined;
  if (AUTH_SEED_LOCAL_IDENTITIES === 'true') {
    if (!['development', 'test'].includes(NODE_ENV)) {
      throw new Error('Local role identities can only be seeded in development or test mode.');
    }
    if (localRoleCredentials.some((value) => !value)) {
      throw new Error(
        'All four local identity email/password pairs are required when AUTH_SEED_LOCAL_IDENTITIES=true.',
      );
    }
    const emails = [
      AUTH_SEED_ADMIN_EMAIL,
      AUTH_SEED_BILLING_OFFICER_EMAIL,
      AUTH_SEED_METER_READER_EMAIL,
      AUTH_SEED_CUSTOMER_EMAIL,
    ].map((email) => email?.toLowerCase());
    if (new Set(emails).size !== emails.length) {
      throw new Error('Each local role identity must use a distinct email address.');
    }
    const passwords = [
      AUTH_SEED_ADMIN_PASSWORD,
      AUTH_SEED_BILLING_OFFICER_PASSWORD,
      AUTH_SEED_METER_READER_PASSWORD,
      AUTH_SEED_CUSTOMER_PASSWORD,
    ];
    if (new Set(passwords).size !== passwords.length) {
      throw new Error('Each local role identity must use a distinct password.');
    }
    if (passwords.some((password) => password !== undefined && password.length < 16)) {
      throw new Error('Local role identity passwords must contain at least 16 characters.');
    }
    const requireValue = (value: string | undefined): string => {
      if (!value) {
        throw new Error(
          'All four local identity email/password pairs are required when AUTH_SEED_LOCAL_IDENTITIES=true.',
        );
      }
      return value;
    };

    localIdentitySeeds = [
      {
        email: requireValue(AUTH_SEED_ADMIN_EMAIL),
        password: requireValue(AUTH_SEED_ADMIN_PASSWORD),
        role: 'admin',
        name: 'Local Admin',
      },
      {
        email: requireValue(AUTH_SEED_BILLING_OFFICER_EMAIL),
        password: requireValue(AUTH_SEED_BILLING_OFFICER_PASSWORD),
        role: 'billing_officer',
        name: 'Local Billing Officer',
      },
      {
        email: requireValue(AUTH_SEED_METER_READER_EMAIL),
        password: requireValue(AUTH_SEED_METER_READER_PASSWORD),
        role: 'meter_reader',
        name: 'Local Meter Reader',
      },
      {
        email: requireValue(AUTH_SEED_CUSTOMER_EMAIL),
        password: requireValue(AUTH_SEED_CUSTOMER_PASSWORD),
        role: 'customer',
        name: 'Local Customer',
      },
    ];
  } else if (
    [
      AUTH_SEED_BILLING_OFFICER_EMAIL,
      AUTH_SEED_BILLING_OFFICER_PASSWORD,
      AUTH_SEED_METER_READER_EMAIL,
      AUTH_SEED_METER_READER_PASSWORD,
      AUTH_SEED_CUSTOMER_EMAIL,
      AUTH_SEED_CUSTOMER_PASSWORD,
    ].some(Boolean)
  ) {
    throw new Error('Role identity credentials require AUTH_SEED_LOCAL_IDENTITIES=true.');
  }

  return {
    databaseUrl: AUTH_DATABASE_URL,
    port: PORT,
    customerServiceUrl: CUSTOMER_SERVICE_URL,
    seedAdminEmail: AUTH_SEED_ADMIN_EMAIL || undefined,
    seedAdminPassword: AUTH_SEED_ADMIN_PASSWORD || undefined,
    localIdentitySeeds,
    jwt: loadJwtConfig(env),
  };
}
