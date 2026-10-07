import { createPublicKey, createSign, createVerify } from 'node:crypto';

const requiredJwkFields = ['alg', 'e', 'kid', 'kty', 'n', 'use'];
const validRoles = new Set(['admin', 'billing_officer', 'meter_reader', 'customer']);
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export class AccessTokenVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AccessTokenVerificationError';
  }
}

export function loadJwtVerificationConfig(issuer, publicJwksJson) {
  if (typeof issuer !== 'string' || issuer.length === 0) {
    throw new Error('JWT issuer must be a non-empty string.');
  }

  let jwksInput;
  try {
    jwksInput = JSON.parse(publicJwksJson);
  } catch {
    throw new Error('JWT_PUBLIC_KEYS_JSON must contain a valid JWKS JSON object.');
  }

  if (
    !isRecord(jwksInput) ||
    Object.keys(jwksInput).length !== 1 ||
    !Array.isArray(jwksInput.keys) ||
    jwksInput.keys.length === 0
  ) {
    throw new Error('JWT public key set must be a JWKS object containing at least one key.');
  }

  const keys = jwksInput.keys;
  const kids = new Set();
  const verificationKeys = new Map();
  for (const key of keys) {
    if (
      !isRecord(key) ||
      Object.keys(key).length !== requiredJwkFields.length ||
      !requiredJwkFields.every((field) => Object.hasOwn(key, field)) ||
      key.kty !== 'RSA' ||
      typeof key.n !== 'string' ||
      !key.n ||
      typeof key.e !== 'string' ||
      !key.e ||
      typeof key.kid !== 'string' ||
      !key.kid ||
      key.use !== 'sig' ||
      key.alg !== 'RS256'
    ) {
      throw new Error('Each JWT public key must be an RS256 RSA signing key with a unique key ID.');
    }
    if (kids.has(key.kid)) {
      throw new Error('JWT_PUBLIC_KEYS_JSON must not contain duplicate key IDs.');
    }
    kids.add(key.kid);

    let publicKey;
    try {
      publicKey = createPublicKey({
        key: { kty: key.kty, n: key.n, e: key.e },
        format: 'jwk',
      });
    } catch {
      throw new Error(`JWT public key ${key.kid} is not a valid RSA JWK.`);
    }
    if (
      publicKey.asymmetricKeyType !== 'rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    ) {
      throw new Error(`JWT public key ${key.kid} must be an RSA key of at least 2048 bits.`);
    }
    verificationKeys.set(key.kid, publicKey);
  }

  return { issuer, verificationKeys, jwks: jwksInput };
}

export function signAccessToken(payload, privateKey, issuer, keyId) {
  if (privateKey.asymmetricKeyType !== 'rsa') {
    throw new Error('Access tokens require an RSA private key.');
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: keyId });
  const claims = encode({
    ...payload,
    iss: issuer,
    iat: issuedAt,
    exp: issuedAt + 15 * 60,
  });
  const signingInput = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;
}

export function verifyAccessToken(token, config) {
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new AccessTokenVerificationError('Access token header is invalid.');
  }

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
  } catch {
    throw new AccessTokenVerificationError('Access token is malformed.');
  }
  if (
    !isRecord(header) ||
    Object.keys(header).some((field) => !['alg', 'typ', 'kid'].includes(field)) ||
    header.alg !== 'RS256' ||
    header.typ !== 'JWT'
  ) {
    throw new AccessTokenVerificationError('Access token header is invalid.');
  }

  const keyId = header.kid;
  if (typeof keyId !== 'string' || keyId.length === 0) {
    throw new AccessTokenVerificationError('Access token does not include a key ID.');
  }

  const publicKey = config.verificationKeys.get(keyId);
  if (!publicKey) {
    throw new AccessTokenVerificationError('Access token was signed by an unknown key.');
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${segments[0]}.${segments[1]}`);
  verifier.end();
  if (!verifier.verify(publicKey, Buffer.from(segments[2], 'base64url'))) {
    throw new AccessTokenVerificationError('Access token signature is invalid.');
  }

  if (
    !isRecord(payload) ||
    payload.iss !== config.issuer ||
    typeof payload.sub !== 'string' ||
    payload.sub.length === 0 ||
    typeof payload.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
    typeof payload.role !== 'string' ||
    !validRoles.has(payload.role) ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    (payload.nbf !== undefined && !Number.isInteger(payload.nbf))
  ) {
    throw new AccessTokenVerificationError('Access token claims are invalid.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now || (Number.isInteger(payload.nbf) && payload.nbf > now)) {
    throw new AccessTokenVerificationError('Access token is expired or not yet valid.');
  }

  return payload;
}
