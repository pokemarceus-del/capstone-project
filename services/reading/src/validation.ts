import { z } from 'zod';

export const billingPeriodSchema = z.object({
  accountId: z.string().uuid(),
  zone: z.string().min(2),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  readingWindowStart: z.string().datetime(),
  readingWindowEnd: z.string().datetime(),
});

export const submitReadingSchema = z.object({
  accountId: z.string().uuid(),
  meterId: z.string().uuid(),
  periodId: z.string().uuid(),
  readingDate: z.string().datetime(),
  registerValue: z.number().nonnegative(),
  noAccessCode: z.boolean().optional(),
  hasPhoto: z.boolean().optional(),
});

export interface ValidationOutcome {
  flags: string[];
  state: 'VALIDATED' | 'FLAGGED' | 'ESTIMATED' | 'REJECTED';
  estimated: boolean;
}

export function validateReading(input: {
  currentReading: number;
  previousReading: number;
  averageConsumption: number;
  readingDate: string;
  windowStart: string;
  windowEnd: string;
  noAccessCode?: boolean;
  hasPhoto?: boolean;
}): ValidationOutcome {
  const flags: string[] = [];

  if (input.currentReading < input.previousReading) {
    flags.push('NEGATIVE');
  }

  const consumption = Math.max(input.currentReading - input.previousReading, 0);
  if (input.averageConsumption > 0 && consumption > input.averageConsumption * 3) {
    flags.push('HIGH_USAGE');
  }

  if (consumption === 0) {
    flags.push('ZERO_USAGE');
  }

  const readingDate = new Date(input.readingDate).getTime();
  const windowStart = new Date(input.windowStart).getTime();
  const windowEnd = new Date(input.windowEnd).getTime();

  if (readingDate < windowStart || readingDate > windowEnd) {
    flags.push('READING_WINDOW_ERROR');
  }

  if (input.noAccessCode) {
    return { flags: ['ESTIMATED'], state: 'ESTIMATED', estimated: true };
  }

  if (input.hasPhoto === false && flags.length > 0) {
    flags.push('NO_PHOTO_WARNING');
  }

  return {
    flags: flags.length > 0 ? flags : [],
    state: flags.length > 0 ? 'FLAGGED' : 'VALIDATED',
    estimated: false,
  };
}
