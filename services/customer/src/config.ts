import { z } from 'zod';
import { loadJwtVerificationConfig } from '@aquaflow/authentication';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CUSTOMER_DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      'must use a PostgreSQL connection URL',
    ),
  CUSTOMER_SEED_DEMO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  JWT_ISSUER: z.string().min(1).default('aquaflow'),
  JWT_PUBLIC_KEYS_JSON: z.string().min(1),
});

export interface CustomerServiceConfig {
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  databaseUrl: string;
  seedDemoData: boolean;
  jwt: ReturnType<typeof loadJwtVerificationConfig>;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): CustomerServiceConfig {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'configuration'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid Customer Service configuration: ${details}`);
  }

  return {
    port: result.data.PORT,
    logLevel: result.data.LOG_LEVEL,
    databaseUrl: result.data.CUSTOMER_DATABASE_URL,
    seedDemoData: result.data.CUSTOMER_SEED_DEMO,
    jwt: loadJwtVerificationConfig(result.data.JWT_ISSUER, result.data.JWT_PUBLIC_KEYS_JSON),
  };
}
