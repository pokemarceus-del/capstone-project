export type TariffClassification = 'Residential' | 'Commercial' | 'Industrial' | 'Government';

export interface Tariff {
  id: string;
  classification: TariffClassification;
  version: string;
  effectiveFrom: string;
  minimumCharge: number;
  block2Rate: number;
  block3Rate: number;
  block4Rate: number;
  block5Rate: number;
  environmentalFeeRate: number;
  meterMaintenanceFee: number;
  vatRate: number;
  latePenaltyRate: number;
  createdAt: string;
}

export interface Bill {
  id: string;
  accountId: string;
  periodId: string;
  tariffId: string;
  consumption: number;
  arrears: number;
  billedAmount: number;
  penaltyAmount: number;
  totalAmount: number;
  status: 'DRAFT' | 'ISSUED' | 'PAID';
  issuedAt?: string;
  createdAt: string;
}
