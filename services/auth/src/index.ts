import { createAuthApp } from './app.js';
import { loadAuthConfig } from './config.js';
import { CustomerDirectory } from './customer-directory.js';
import { AuthStore } from './store.js';

const config = loadAuthConfig(process.env);
const store = new AuthStore();
const customerDirectory = new CustomerDirectory(config.customerServiceUrl);
const app = createAuthApp(store, config, customerDirectory);

const start = async () => {
  await store.connect();
  await store.ensureRoles();
  if (config.localIdentitySeeds) {
    for (const identity of config.localIdentitySeeds) {
      await store.seedLocalIdentity(identity);
    }
  } else if (config.seedAdminEmail && config.seedAdminPassword) {
    await store.seedAdmin(config.seedAdminEmail, config.seedAdminPassword);
  }

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`auth service listening on ${config.port}`);
};

start().catch(async (error: unknown) => {
  console.error('Auth Service failed to start', error);
  if (app.server.listening) {
    await app.close();
  }
  await store.disconnect();
  process.exit(1);
});
