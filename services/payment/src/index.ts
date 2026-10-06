import { randomUUID } from 'node:crypto';
import fastify, { FastifyReply, FastifyRequest } from 'fastify';
import type { PaymentAttempt } from './domain.js';
import { paymentSchema } from './validation.js';

const app = fastify({ logger: false });
const payments = new Map<string, PaymentAttempt>();

app.get('/healthz', async () => ({
  status: 'ok',
  service: 'payment',
  timestamp: new Date().toISOString(),
}));
app.get('/api/v1/info', async () => ({
  service: 'payment',
  description: 'Payment processing service',
}));

app.get('/api/v1/payments', async () => ({ items: [...payments.values()], count: payments.size }));

app.post('/api/v1/payments', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = paymentSchema.parse(request.body);
  const existing = [...payments.values()].find(
    (payment) =>
      payment.accountId === payload.accountId && payment.idempotencyKey === payload.idempotencyKey,
  );

  if (existing) {
    return reply.code(200).send(existing);
  }

  const payment: PaymentAttempt = {
    id: randomUUID(),
    accountId: payload.accountId,
    amount: payload.amount,
    currency: payload.currency,
    status: 'CONFIRMED',
    idempotencyKey: payload.idempotencyKey,
    providerReference: `mock-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };

  payments.set(payment.id, payment);
  return reply.code(201).send(payment);
});

const start = async () => {
  const port = Number(process.env.PORT ?? 3005);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`payment service listening on ${port}`);
};

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
