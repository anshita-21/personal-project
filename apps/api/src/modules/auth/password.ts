import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * `util.promisify` collapses scrypt to its 3-argument overload and drops the
 * options parameter, so the cost parameters are wrapped by hand instead.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

/**
 * Password hashing with Node's built-in scrypt.
 *
 * Why scrypt and not bcrypt/argon2: scrypt is memory-hard, is in the Node
 * standard library (no native build step, so `npm install` cannot fail on a
 * machine without a compiler), and the parameters below exceed the Node
 * defaults. The cost parameters are stored INSIDE the hash string, so they can
 * be raised later without invalidating existing passwords - `verifyPassword`
 * reads whatever parameters a given row was written with.
 *
 * Format: scrypt$<N>$<r>$<p>$<saltBase64>$<keyBase64>
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, keyLength: 64, saltLength: 16 } as const;
const PREFIX = 'scrypt';

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(PARAMS.saltLength);
  const derived = await scrypt(plain, salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    // scrypt needs at least 128 * N * r bytes; Node's default cap is lower.
    maxmem: 256 * PARAMS.N * PARAMS.r,
  });

  return [
    PREFIX,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) {
    return false;
  }

  const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const salt = Buffer.from(saltRaw, 'base64');
  const expected = Buffer.from(keyRaw, 'base64');
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const actual = await scrypt(plain, salt, expected.length, {
    N,
    r,
    p,
    maxmem: 256 * N * r,
  });

  // Constant-time: a length-dependent or short-circuiting compare leaks how
  // much of the hash matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
