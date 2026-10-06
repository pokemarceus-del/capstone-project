export type RoleName = 'admin' | 'billing_officer' | 'meter_reader' | 'customer';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  name: string;
  createdAt: string;
}

export interface RefreshSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}
