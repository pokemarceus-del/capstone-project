export type CustomerStatus = 'active' | 'inactive' | 'archived';
export type MeterStatus = 'active' | 'retired';
export type AccountClassification = 'Residential' | 'Commercial' | 'Industrial' | 'Government';
export type AccountStatus = 'active' | 'inactive';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: CustomerStatus;
  createdAt: string;
}

export interface ServiceAccount {
  id: string;
  customerId: string;
  address: string;
  zone: string;
  classification: AccountClassification;
  status: AccountStatus;
  activeMeterId?: string | null;
  createdAt: string;
}

export interface Meter {
  id: string;
  serialNumber: string;
  accountId: string;
  size: string;
  registerDigits: number;
  currentReading: number;
  status: MeterStatus;
  installedAt: string;
  replacedAt?: string | null;
}

export interface PageResult<T> {
  items: T[];
  count: number;
  page: number;
  limit: number;
  total: number;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface CustomerListQuery extends PaginationOptions {
  q?: string;
  status?: CustomerStatus;
}

export interface AccountListQuery extends PaginationOptions {
  q?: string;
  customerId?: string;
  zone?: string;
  status?: AccountStatus;
  classification?: AccountClassification;
}

export interface MeterInstallationHistory {
  installationId: string;
  meterId: string;
  serialNumber: string;
  size: string;
  registerDigits: number;
  status: MeterStatus;
  installedAt: string;
  removedAt: string | null;
  initialReading: number;
  finalReading: number | null;
}
