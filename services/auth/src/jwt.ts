import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import {
  loadJwtVerificationConfig,
  signAccessToken as signSharedAccessToken,
  verifyAccessToken,
  type AuthTokenPayload,
  type JwtVerificationConfig,
} from '@aquaflow/authentication';

const jwtConfigSchema = z.object({
  JWT_ISSUER: z.string().min(1).default('aquaflow'),
  JWT_ACTIVE_KID: z.string().min(1),
  JWT_PRIVATE_KEY_B64: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be a base64-encoded PKCS#8 RSA private key'),
  JWT_PUBLIC_KEYS_JSON: z.string().min(1),
});

export interface JwtConfig extends JwtVerificationConfig {
  activeKid: string;
  privateKey: KeyObject;
}

export type { AuthTokenPayload };
export { verifyAccessToken };

export function loadJwtConfig(env: NodeJS.ProcessEnv): JwtConfig {
  const parsedEnv = jwtConfigSchema.safeParse(env);
  if (!parsedEnv.success) {
    throw new Error(
      `Invalid JWT key configuration: ${parsedEnv.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const verificationConfig = loadJwtVerificationConfig(
    parsedEnv.data.JWT_ISSUER,
    parsedEnv.data.JWT_PUBLIC_KEYS_JSON,
  );
  const activePublicJwk = verificationConfig.jwks.keys.find(
    (key) => key.kid === parsedEnv.data.JWT_ACTIVE_KID,
  );
  if (!activePublicJwk)
    throw new Error('JWT_ACTIVE_KID must identify a key in JWT_PUBLIC_KEYS_JSON.');

  const encodedPrivateKey = parsedEnv.data.JWT_PRIVATE_KEY_B64;
  const privateKeyDer = Buffer.from(encodedPrivateKey, 'base64');
  if (
    privateKeyDer.toString('base64').replace(/=+$/, '') !== encodedPrivateKey.replace(/=+$/, '')
  ) {
    throw new Error('JWT_PRIVATE_KEY_B64 must be valid base64.');
  }

  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({
      key: privateKeyDer,
      format: 'der',
      type: 'pkcs8',
    });
  } catch {
    throw new Error('JWT_PRIVATE_KEY_B64 must contain a valid PKCS#8 private key.');
  }

  if (
    privateKey.asymmetricKeyType !== 'rsa' ||
    (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
  ) {
    throw new Error('JWT_PRIVATE_KEY_B64 must contain an RSA key of at least 2048 bits.');
  }

  const derivedPublicJwk = createPublicKey(privateKey).export({ format: 'jwk' });
  if (derivedPublicJwk.n !== activePublicJwk.n || derivedPublicJwk.e !== activePublicJwk.e) {
    throw new Error('The active JWT public key does not match JWT_PRIVATE_KEY_B64.');
  }

  return {
    activeKid: parsedEnv.data.JWT_ACTIVE_KID,
    privateKey,
    ...verificationConfig,
  };
}

export function signAccessToken(
  payload: Pick<AuthTokenPayload, 'sub' | 'email' | 'role'>,
  config: JwtConfig,
): string {
  return signSharedAccessToken(payload, config.privateKey, config.issuer, config.activeKid);
}
