import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(10),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  name: z.string().min(2),
  role: z.enum(['admin', 'billing_officer', 'meter_reader']),
});

export const customerInvitationSchema = z.object({
  customerId: z.string().uuid(),
});

export const customerRegistrationSchema = z.object({
  invitationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(12).max(128),
});

export const seedAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
