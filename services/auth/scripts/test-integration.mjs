import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const integrationUrl = process.env.AUTH_INTEGRATION_DATABASE_URL;
if (!integrationUrl) {
  console.error('Set AUTH_INTEGRATION_DATABASE_URL to a dedicated *_test PostgreSQL database.');
  process.exit(1);
}

let databaseName;
try {
  databaseName = decodeURIComponent(new URL(integrationUrl).pathname.slice(1));
} catch (error) {
  console.error('AUTH_INTEGRATION_DATABASE_URL must be a valid PostgreSQL URL.', error);
  process.exit(1);
}
if (!databaseName.endsWith('_test')) {
  console.error('AUTH_INTEGRATION_DATABASE_URL must identify a database ending in _test.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const authDatabaseEnv = { ...process.env, AUTH_DATABASE_URL: integrationUrl };
const prismaCli = require.resolve('prisma/build/index.js');
const migration = spawnSync(
  process.execPath,
  [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  { cwd: resolve(import.meta.dirname, '..'), env: authDatabaseEnv, stdio: 'inherit' },
);
if (migration.error) {
  throw migration.error;
}
if (migration.status !== 0) {
  process.exit(migration.status ?? 1);
}

const vitestCli = require.resolve('vitest/vitest.mjs');
const tests = spawnSync(
  process.execPath,
  [vitestCli, 'run', '--testTimeout', '30000', 'tests/auth.integration.test.ts'],
  { cwd: resolve(import.meta.dirname, '..'), env: process.env, stdio: 'inherit' },
);
if (tests.error) {
  throw tests.error;
}
process.exit(tests.status ?? 1);
