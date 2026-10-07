export type RoleName = 'admin' | 'billing_officer' | 'meter_reader' | 'customer';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  name: string;
  createdAt: string;
  emailVerifiedAt: string | null;
}

export interface RefreshSession {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export interface LoginEvent {
  id: string;
  userId: string | null;
  email: string;
  outcome: 'SUCCESS' | 'FAILURE';
  createdAt: string;
}
