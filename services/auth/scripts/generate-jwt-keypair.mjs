import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const outputPath = resolve(projectRoot, process.argv[2] ?? '.env.jwt-keys');
if (existsSync(outputPath)) {
  console.error(`Refusing to overwrite existing key material: ${outputPath}`);
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
});
const kid = `rsa-${randomUUID()}`;
const jwk = publicKey.export({ format: 'jwk' });
if (!jwk.n || !jwk.e) {
  throw new Error('Generated RSA public key did not contain the expected JWK parameters.');
}

const publicJwk = {
  kty: 'RSA',
  n: jwk.n,
  e: jwk.e,
  kid,
  use: 'sig',
  alg: 'RS256',
};
const contents = [
  `JWT_ACTIVE_KID=${kid}`,
  `JWT_PRIVATE_KEY_B64=${privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')}`,
  `JWT_PUBLIC_KEYS_JSON='${JSON.stringify({ keys: [publicJwk] })}'`,
  '',
].join('\n');

const descriptor = openSync(outputPath, 'wx', 0o600);
try {
  writeFileSync(descriptor, contents, { encoding: 'utf8' });
} finally {
  closeSync(descriptor);
}
console.log(
  `Generated local RS256 key settings in ${outputPath}. Keep the private key file secret and uncommitted.`,
);
