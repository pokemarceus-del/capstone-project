import type { KeyObject } from 'node:crypto';

export type AuthRole = 'admin' | 'billing_officer' | 'meter_reader' | 'customer';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: AuthRole;
  iat?: number;
  exp?: number;
}

export interface PublicJwk {
  kty: 'RSA';
  n: string;
  e: string;
  kid: string;
  use: 'sig';
  alg: 'RS256';
}

export interface JwtVerificationConfig {
  issuer: string;
  verificationKeys: ReadonlyMap<string, KeyObject>;
  jwks: { keys: PublicJwk[] };
}

export class AccessTokenVerificationError extends Error {}

export function loadJwtVerificationConfig(
  issuer: string,
  publicJwksJson: string,
): JwtVerificationConfig;

export function signAccessToken(
  payload: Pick<AuthTokenPayload, 'sub' | 'email' | 'role'>,
  privateKey: KeyObject,
  issuer: string,
  keyId: string,
): string;

export function verifyAccessToken(token: string, config: JwtVerificationConfig): AuthTokenPayload;
