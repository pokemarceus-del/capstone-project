import fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ReadingStore } from './store.js';
import { billingPeriodSchema, submitReadingSchema, validateReading } from './validation.js';

const app = fastify({ logger: false });
const store = new ReadingStore();

app.get('/healthz', async () => ({
  status: 'ok',
  service: 'reading',
  timestamp: new Date().toISOString(),
}));

app.get('/api/v1/info', async () => ({
  service: 'reading',
  description: 'Meter reading and validation service',
}));

app.get('/api/v1/periods', async () => ({
  items: store.listBillingPeriods(),
  count: store.listBillingPeriods().length,
}));

app.post('/api/v1/periods', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = billingPeriodSchema.parse(request.body);
  const period = store.createBillingPeriod({
    accountId: payload.accountId,
    zone: payload.zone,
    startDate: payload.startDate,
    endDate: payload.endDate,
    readingWindowStart: payload.readingWindowStart,
    readingWindowEnd: payload.readingWindowEnd,
  });

  return reply.code(201).send(period);
});

app.get('/api/v1/readings', async () => ({
  items: store.listReadings(),
  count: store.listReadings().length,
}));

app.post('/api/v1/readings/submit', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = submitReadingSchema.parse(request.body);
  const period = store.listBillingPeriods().find((item) => item.id === payload.periodId);

  if (!period) {
    return reply
      .code(404)
      .send({ error: { code: 'PERIOD_NOT_FOUND', message: 'Billing period not found.' } });
  }

  const previous = store
    .listReadings()
    .filter((entry) => entry.accountId === payload.accountId && entry.meterId === payload.meterId)
    .sort((a, b) => Date.parse(b.readingDate) - Date.parse(a.readingDate))[0];

  const previousReading = previous?.registerValue ?? payload.registerValue;
  const averageConsumption =
    store
      .listReadings()
      .filter((entry) => entry.accountId === payload.accountId && entry.meterId === payload.meterId)
      .map((entry) => entry.consumption)
      .slice(-3)
      .reduce((sum, value) => sum + value, 0) / 3 || 0;

  const validation = validateReading({
    currentReading: payload.registerValue,
    previousReading,
    averageConsumption,
    readingDate: payload.readingDate,
    windowStart: period.readingWindowStart,
    windowEnd: period.readingWindowEnd,
    noAccessCode: payload.noAccessCode ?? false,
    hasPhoto: payload.hasPhoto ?? true,
  });

  const reading = store.submitReading({
    accountId: payload.accountId,
    meterId: payload.meterId,
    periodId: payload.periodId,
    readingDate: payload.readingDate,
    registerValue: payload.registerValue,
    state: validation.state,
    estimated: validation.estimated,
    anomalyCodes: validation.flags,
    notes: validation.flags.join(', '),
  });

  return reply.code(201).send(reading);
});

app.get('/api/v1/readings/flagged', async () => ({
  items: store.listFlaggedReadings(),
  count: store.listFlaggedReadings().length,
}));

app.post(
  '/api/v1/readings/:id/review',
  async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z.object({ state: z.enum(['APPROVED', 'REJECTED']) }).parse(request.body);
    const updated = store.updateReadingState(id, payload.state);

    if (!updated) {
      return reply
        .code(404)
        .send({ error: { code: 'READING_NOT_FOUND', message: 'Reading not found.' } });
    }

    return updated;
  },
);

const start = async () => {
  const port = Number(process.env.PORT ?? 3003);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`reading service listening on ${port}`);
};

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
