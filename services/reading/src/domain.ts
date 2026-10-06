export type ReadingState =
  'SUBMITTED' | 'VALIDATED' | 'FLAGGED' | 'APPROVED' | 'REJECTED' | 'ESTIMATED';

export interface BillingPeriod {
  id: string;
  accountId: string;
  zone: string;
  startDate: string;
  endDate: string;
  readingWindowStart: string;
  readingWindowEnd: string;
  createdAt: string;
}

export interface Reading {
  id: string;
  accountId: string;
  meterId: string;
  periodId: string;
  readingDate: string;
  registerValue: number;
  previousRegisterValue: number;
  consumption: number;
  state: ReadingState;
  estimated: boolean;
  anomalyCodes: string[];
  notes?: string;
  createdAt: string;
}
