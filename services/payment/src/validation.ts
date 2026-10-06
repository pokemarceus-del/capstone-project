import { z } from 'zod';

export const paymentSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  idempotencyKey: z.string().min(1),
});
