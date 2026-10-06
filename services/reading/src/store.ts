import { randomUUID } from 'node:crypto';
import type { BillingPeriod, Reading } from './domain.js';

export class ReadingStore {
  private periods: BillingPeriod[] = [];
  private readings: Reading[] = [];

  createBillingPeriod(input: Omit<BillingPeriod, 'id' | 'createdAt'>): BillingPeriod {
    const period: BillingPeriod = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };

    this.periods.push(period);
    return period;
  }

  listBillingPeriods(): BillingPeriod[] {
    return [...this.periods];
  }

  submitReading(
    input: Omit<Reading, 'id' | 'createdAt' | 'consumption' | 'previousRegisterValue'> & {
      previousRegisterValue?: number;
    },
  ): Reading {
    const duplicate = this.readings.find(
      (reading) =>
        reading.accountId === input.accountId &&
        reading.meterId === input.meterId &&
        reading.periodId === input.periodId,
    );

    if (duplicate) {
      return duplicate;
    }

    const previous = [...this.readings]
      .filter(
        (reading) => reading.accountId === input.accountId && reading.meterId === input.meterId,
      )
      .sort((a, b) => Date.parse(b.readingDate) - Date.parse(a.readingDate))[0];

    const previousRegisterValue =
      previous?.registerValue ?? input.previousRegisterValue ?? input.registerValue;
    const consumption = Math.max(input.registerValue - previousRegisterValue, 0);

    const reading: Reading = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      previousRegisterValue,
      consumption,
      ...input,
      anomalyCodes: input.anomalyCodes ?? [],
    };

    this.readings.push(reading);
    return reading;
  }

  listReadings(): Reading[] {
    return [...this.readings];
  }

  listFlaggedReadings(): Reading[] {
    return this.readings.filter(
      (reading) => reading.state === 'FLAGGED' || reading.state === 'ESTIMATED',
    );
  }

  updateReadingState(id: string, state: Reading['state']): Reading | undefined {
    const reading = this.readings.find((entry) => entry.id === id);
    if (!reading) return undefined;
    reading.state = state;
    return reading;
  }
}
