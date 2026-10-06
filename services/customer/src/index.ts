import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { CustomerStore } from './store.js';

const start = async (): Promise<void> => {
  const config = loadConfig();
  const prisma = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
  });
  await prisma.$connect();

  const store = new CustomerStore(prisma);
  if (config.seedDemoData) {
    await store.seed();
  }

  const openApiDocument: unknown = JSON.parse(
    await readFile(new URL('../openapi.json', import.meta.url), 'utf8'),
  );
  const app = createApp(
    store,
    async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    config.logLevel,
    openApiDocument,
  );
  app.addHook('onClose', async () => prisma.$disconnect());
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`customer service listening on ${config.port}`);
};

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
