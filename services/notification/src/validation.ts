import { z } from 'zod';

export const notificationSchema = z.object({
  template: z.string().min(1),
  channel: z.enum(['EMAIL', 'PORTAL']),
  recipient: z.string().email().or(z.string().min(3)),
  message: z.string().min(1),
});
