import { randomUUID } from 'node:crypto';
import fastify, { FastifyReply, FastifyRequest } from 'fastify';
import type { NotificationRecord } from './domain.js';
import { notificationSchema } from './validation.js';

const app = fastify({ logger: false });
const notifications = new Map<string, NotificationRecord & { message: string }>();

app.get('/healthz', async () => ({
  status: 'ok',
  service: 'notification',
  timestamp: new Date().toISOString(),
}));
app.get('/api/v1/info', async () => ({
  service: 'notification',
  description: 'Notification delivery service',
}));

app.get('/api/v1/notifications', async () => ({
  items: [...notifications.values()],
  count: notifications.size,
}));

app.post('/api/v1/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = notificationSchema.parse(request.body);
  const record: NotificationRecord & { message: string } = {
    id: randomUUID(),
    template: payload.template,
    channel: payload.channel,
    recipient: payload.recipient,
    status: 'SENT',
    createdAt: new Date().toISOString(),
    message: payload.message,
  };

  notifications.set(record.id, record);
  return reply.code(201).send(record);
});

const start = async () => {
  const port = Number(process.env.PORT ?? 3006);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`notification service listening on ${port}`);
};

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
