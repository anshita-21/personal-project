import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('never stores the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
  });

  it('produces a self-describing hash with the cost parameters embedded', async () => {
    const hash = await hashPassword('Password123!');
    const [algorithm, n, r, p, salt, key] = hash.split('$');

    expect(algorithm).toBe('scrypt');
    expect(Number(n)).toBe(32768);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(Buffer.from(salt ?? '', 'base64')).toHaveLength(16);
    expect(Buffer.from(key ?? '', 'base64')).toHaveLength(64);
  });

  it('salts each hash, so the same password hashes differently', async () => {
    const [first, second] = await Promise.all([
      hashPassword('Password123!'),
      hashPassword('Password123!'),
    ]);
    expect(first).not.toBe(second);
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('Password123!');
    await expect(verifyPassword('Password123!', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Password123!');
    await expect(verifyPassword('Password123', hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('can still verify a hash written with different cost parameters', async () => {
    // Simulates a row created before the cost was raised: the parameters are
    // read from the stored hash, so old passwords keep working.
    const legacy = await hashPassword('Password123!');
    const [, , r, p, salt, key] = legacy.split('$');
    const rewritten = ['scrypt', 16384, r, p, salt, key].join('$');

    // The derived key differs because N differs, so verification must fail
    // rather than succeed by accident.
    await expect(verifyPassword('Password123!', rewritten)).resolves.toBe(false);
    await expect(verifyPassword('Password123!', legacy)).resolves.toBe(true);
  });

  it('rejects malformed hashes instead of throwing', async () => {
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$1$2$3$4$5')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$a$b$c$d$e')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$16384$8$1$$')).resolves.toBe(false);
  });
});
