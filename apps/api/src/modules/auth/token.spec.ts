import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { signSessionToken, verifySessionToken } from './token';

const payload = { sub: 'user-1', role: 'STUDENT' as const, jti: 'session-1' };

describe('session tokens', () => {
  it('round-trips a valid payload', () => {
    expect(verifySessionToken(signSessionToken(payload))).toEqual(payload);
  });

  it('rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign(payload, 'a-different-secret-that-is-long-enough-32');
    expect(verifySessionToken(forged)).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '-1s' });
    expect(verifySessionToken(expired)).toBeNull();
  });

  it('rejects a token whose algorithm was swapped to none', () => {
    const unsigned = jwt.sign(payload, '', { algorithm: 'none' });
    expect(verifySessionToken(unsigned)).toBeNull();
  });

  it('rejects a well-signed token with a payload shape we do not accept', () => {
    expect(verifySessionToken(jwt.sign({ sub: 'u' }, env.JWT_SECRET))).toBeNull();
    expect(
      verifySessionToken(jwt.sign({ sub: 'u', jti: 's', role: 'SUPERUSER' }, env.JWT_SECRET)),
    ).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('not.a.token')).toBeNull();
  });
});
