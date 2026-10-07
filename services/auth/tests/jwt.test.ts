import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { loadJwtConfig, signAccessToken, verifyAccessToken } from '../src/jwt.js';

const issuer = 'aquaflow-test';

function createKeyEnvironment(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const jwk = publicKey.export({ format: 'jwk' });
  if (!jwk.n || !jwk.e) {
    throw new Error('Generated test RSA key did not contain the expected JWK parameters.');
  }

  const publicJwk = { kty: 'RSA', n: jwk.n, e: jwk.e, kid, use: 'sig', alg: 'RS256' };
  return {
    privateKey,
    publicJwk,
    env: {
      JWT_ISSUER: issuer,
      JWT_ACTIVE_KID: kid,
      JWT_PRIVATE_KEY_B64: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
      JWT_PUBLIC_KEYS_JSON: JSON.stringify({ keys: [publicJwk] }),
    },
  };
}

describe('asymmetric access token keys', () => {
  it('signs RS256 access tokens with the active key ID and verifies the claims', () => {
    const current = createKeyEnvironment('current-key');
    const config = loadJwtConfig(current.env);
    const token = signAccessToken(
      { sub: 'user-1', email: 'reader@example.test', role: 'meter_reader' },
      config,
    );
    const decoded = jwt.decode(token, { complete: true });

    expect(decoded).toMatchObject({
      header: { alg: 'RS256', kid: 'current-key' },
      payload: {
        sub: 'user-1',
        email: 'reader@example.test',
        role: 'meter_reader',
        iss: issuer,
      },
    });
    expect(verifyAccessToken(token, config)).toMatchObject({
      sub: 'user-1',
      email: 'reader@example.test',
      role: 'meter_reader',
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
  });

  it('continues to verify old tokens while a new key is active', () => {
    const oldKey = createKeyEnvironment('old-key');
    const newKey = createKeyEnvironment('new-key');
    const oldConfig = loadJwtConfig(oldKey.env);
    const token = signAccessToken(
      { sub: 'user-1', email: 'reader@example.test', role: 'meter_reader' },
      oldConfig,
    );
    const rotatedConfig = loadJwtConfig({
      ...newKey.env,
      JWT_PUBLIC_KEYS_JSON: JSON.stringify({
        keys: [oldKey.publicJwk, newKey.publicJwk],
      }),
    });

    expect(verifyAccessToken(token, rotatedConfig).sub).toBe('user-1');
    expect(rotatedConfig.jwks.keys.map((key) => key.kid)).toEqual(['old-key', 'new-key']);
  });

  it('rejects unknown key IDs and non-RS256 algorithms', () => {
    const current = createKeyEnvironment('known-key');
    const config = loadJwtConfig(current.env);
    const payload = { sub: 'user-1', email: 'reader@example.test', role: 'meter_reader' };
    const unknownKeyToken = jwt.sign(payload, current.privateKey, {
      algorithm: 'RS256',
      issuer,
      keyid: 'unknown-key',
    });
    const wrongAlgorithmToken = jwt.sign(payload, 'a-secret-that-is-long-enough', {
      algorithm: 'HS256',
      issuer,
      keyid: 'known-key',
    });

    expect(() => verifyAccessToken(unknownKeyToken, config)).toThrow('unknown key');
    expect(() => verifyAccessToken(wrongAlgorithmToken, config)).toThrow('header is invalid');
  });

  it('rejects expired tokens even when their signature and key ID are valid', () => {
    const current = createKeyEnvironment('valid-key');
    const config = loadJwtConfig(current.env);
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = jwt.sign(
      {
        sub: 'user-1',
        email: 'reader@example.test',
        role: 'meter_reader',
        iat: now - 60,
        exp: now - 1,
      },
      current.privateKey,
      { algorithm: 'RS256', issuer, keyid: 'valid-key' },
    );

    expect(() => verifyAccessToken(expiredToken, config)).toThrow('expired');
  });

  it('rejects a private key that does not match the active public key', () => {
    const active = createKeyEnvironment('active-key');
    const other = createKeyEnvironment('other-key');

    expect(() =>
      loadJwtConfig({
        ...active.env,
        JWT_PRIVATE_KEY_B64: other.env.JWT_PRIVATE_KEY_B64,
      }),
    ).toThrow('does not match');
  });
});
