import { generateKeyPairSync } from 'node:crypto';
import {
  loadJwtVerificationConfig,
  signAccessToken,
  type AuthRole,
} from '@aquaflow/authentication';

const issuer = 'aquaflow-customer-tests';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
});
const jwk = publicKey.export({ format: 'jwk' });
if (!jwk.n || !jwk.e) {
  throw new Error('Generated test RSA key did not contain the expected JWK parameters.');
}

export const jwtEnvironment = {
  JWT_ISSUER: issuer,
  JWT_PUBLIC_KEYS_JSON: JSON.stringify({
    keys: [{ kty: 'RSA', n: jwk.n, e: jwk.e, kid: 'customer-test-key', use: 'sig', alg: 'RS256' }],
  }),
};

export const jwtConfig = loadJwtVerificationConfig(issuer, jwtEnvironment.JWT_PUBLIC_KEYS_JSON);

export function tokenForRole(role: AuthRole): string {
  return signAccessToken(
    { sub: `test-${role}`, email: `${role}@example.test`, role },
    privateKey,
    issuer,
    'customer-test-key',
  );
}
