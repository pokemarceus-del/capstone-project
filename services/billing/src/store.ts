import { randomUUID } from 'node:crypto';
import type { Bill, Tariff } from './domain.js';

export class BillingStore {
  private tariffs: Tariff[] = [];
  private bills: Bill[] = [];

  createTariff(input: Omit<Tariff, 'id' | 'createdAt'>): Tariff {
    const tariff: Tariff = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };

    this.tariffs.push(tariff);
    return tariff;
  }

  listTariffs(): Tariff[] {
    return [...this.tariffs];
  }

  createBill(input: Omit<Bill, 'id' | 'createdAt'>): Bill {
    const bill: Bill = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };

    this.bills.push(bill);
    return bill;
  }

  listBills(): Bill[] {
    return [...this.bills];
  }
}
