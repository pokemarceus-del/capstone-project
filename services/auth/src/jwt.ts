import jwt from 'jsonwebtoken';

const JWT_SECRET =
  process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'development-secret-key');
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'aquaflow';

if (process.env.NODE_ENV === 'production' && Buffer.byteLength(JWT_SECRET) < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes in production.');
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    expiresIn: '15m',
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
  }) as AuthTokenPayload;
}
