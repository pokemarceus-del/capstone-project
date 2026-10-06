import fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { BillingStore } from './store.js';
import { calculateBill } from './tariff.js';

const app = fastify({ logger: false });
const store = new BillingStore();

const tariffSchema = z.object({
  classification: z.enum(['Residential', 'Commercial', 'Industrial', 'Government']),
  version: z.string(),
  effectiveFrom: z.string().datetime(),
  minimumCharge: z.number().nonnegative(),
  block2Rate: z.number().nonnegative(),
  block3Rate: z.number().nonnegative(),
  block4Rate: z.number().nonnegative(),
  block5Rate: z.number().nonnegative(),
  environmentalFeeRate: z.number().nonnegative(),
  meterMaintenanceFee: z.number().nonnegative(),
  vatRate: z.number().nonnegative(),
  latePenaltyRate: z.number().nonnegative(),
});

app.get('/healthz', async () => ({
  status: 'ok',
  service: 'billing',
  timestamp: new Date().toISOString(),
}));

app.get('/api/v1/info', async () => ({
  service: 'billing',
  description: 'Billing engine with tariff logic and bill issuance',
}));

app.get('/api/v1/tariffs', async () => ({
  items: store.listTariffs(),
  count: store.listTariffs().length,
}));

app.post('/api/v1/tariffs', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = tariffSchema.parse(request.body);
  const tariff = store.createTariff({
    classification: payload.classification,
    version: payload.version,
    effectiveFrom: payload.effectiveFrom,
    minimumCharge: payload.minimumCharge,
    block2Rate: payload.block2Rate,
    block3Rate: payload.block3Rate,
    block4Rate: payload.block4Rate,
    block5Rate: payload.block5Rate,
    environmentalFeeRate: payload.environmentalFeeRate,
    meterMaintenanceFee: payload.meterMaintenanceFee,
    vatRate: payload.vatRate,
    latePenaltyRate: payload.latePenaltyRate,
  });

  return reply.code(201).send(tariff);
});

app.post('/api/v1/bill-runs/preview', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = z
    .object({
      consumption: z.number().nonnegative(),
      arrears: z.number().nonnegative(),
      meterSizeInches: z.number().optional(),
      classification: z.string().optional(),
    })
    .parse(request.body);

  const result = calculateBill(payload);
  return reply.code(200).send({
    ...result,
    billTotal: result.total,
    amountDue: result.total,
  });
});

app.post('/api/v1/bills', async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = z
    .object({
      accountId: z.string().uuid(),
      periodId: z.string().uuid(),
      tariffId: z.string().uuid(),
      consumption: z.number().nonnegative(),
      arrears: z.number().nonnegative(),
      meterSizeInches: z.number().optional(),
    })
    .parse(request.body);

  const calculation = calculateBill({
    consumption: payload.consumption,
    arrears: payload.arrears,
    meterSizeInches: payload.meterSizeInches ?? 0.5,
  });

  const bill = store.createBill({
    accountId: payload.accountId,
    periodId: payload.periodId,
    tariffId: payload.tariffId,
    consumption: payload.consumption,
    arrears: payload.arrears,
    billedAmount: calculation.total,
    penaltyAmount: calculation.penalty,
    totalAmount: calculation.total,
    status: 'ISSUED',
    issuedAt: new Date().toISOString(),
  });

  return reply.code(201).send(bill);
});

app.get('/api/v1/bills', async () => ({
  items: store.listBills(),
  count: store.listBills().length,
}));

const start = async () => {
  const port = Number(process.env.PORT ?? 3004);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`billing service listening on ${port}`);
};

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
