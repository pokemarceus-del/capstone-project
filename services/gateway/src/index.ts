import { createGatewayApp } from './app.js';

const start = async () => {
  const app = createGatewayApp(process.env);
  const port = Number(process.env.PORT ?? 8080);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info({ port }, 'Gateway listening');
};

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
