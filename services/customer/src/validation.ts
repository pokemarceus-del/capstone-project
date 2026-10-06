import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
});

export const accountSchema = z.object({
  customerId: z.string().uuid(),
  address: z.string().min(5),
  zone: z.string().min(2),
  classification: z.enum(['Residential', 'Commercial', 'Industrial', 'Government']),
  status: z.enum(['active', 'inactive']).default('active'),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const customerListQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

export const accountListQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
  customerId: z.string().uuid().optional(),
  zone: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  classification: z.enum(['Residential', 'Commercial', 'Industrial', 'Government']).optional(),
});

export const accountStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

export const meterInstallSchema = z.object({
  accountId: z.string().uuid(),
  serialNumber: z.string().min(3),
  size: z.string().min(2),
  registerDigits: z.number().int().positive(),
  currentReading: z.number().nonnegative(),
  status: z.literal('active').default('active'),
});

export const meterReplacementSchema = z.object({
  accountId: z.string().uuid(),
  oldMeterId: z.string().uuid(),
  newSerialNumber: z.string().min(3),
  newSize: z.string().min(2),
  registerDigits: z.number().int().positive(),
  finalReading: z.number().nonnegative(),
  currentReading: z.number().nonnegative(),
  replacementAt: z.string().datetime().optional(),
});
