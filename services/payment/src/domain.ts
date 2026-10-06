export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';

export interface PaymentAttempt {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
  providerReference?: string;
  createdAt: string;
}
