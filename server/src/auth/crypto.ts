import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LEN, { N: n, r, p }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Password hash in the form scrypt$N$r$p$salt$key, so parameters can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A hash to compare against when the account does not exist, so timing does not reveal it. */
export const DUMMY_HASH = await hashPassword('dummy-password-for-timing');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Tokens and codes are stored hashed: a leaked database does not leak usable credentials. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
