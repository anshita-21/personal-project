import request from 'supertest';
import { prisma } from '../src/db/prisma';
import { createStudent } from '../src/testing/fixtures';
import { app, anonymous, signIn, signedInStudent } from './helpers';

const validRegistration = {
  name: 'Priya Raman',
  email: 'priya@example.com',
  password: 'Password123',
};

describe('POST /api/v1/auth/register', () => {
  it('creates a STUDENT account and sets an httpOnly session cookie', async () => {
    const response = await request(app).post('/api/v1/auth/register').send(validRegistration);

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      name: 'Priya Raman',
      email: 'priya@example.com',
      role: 'STUDENT',
    });

    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('examprep_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('never returns the password hash', async () => {
    const response = await request(app).post('/api/v1/auth/register').send(validRegistration);
    expect(JSON.stringify(response.body)).not.toContain('scrypt');
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('stores a hash, not the plaintext password', async () => {
    await request(app).post('/api/v1/auth/register').send(validRegistration);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'priya@example.com' },
      select: { passwordHash: true },
    });

    expect(user.passwordHash).not.toContain('Password123');
    expect(user.passwordHash.startsWith('scrypt$')).toBe(true);
  });

  it('cannot be used to create an administrator', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validRegistration, role: 'ADMIN' });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('STUDENT');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/v1/auth/register').send(validRegistration);
    const response = await request(app).post('/api/v1/auth/register').send(validRegistration);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('treats email as case-insensitive', async () => {
    await request(app).post('/api/v1/auth/register').send(validRegistration);
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validRegistration, email: 'PRIYA@example.com' });

    expect(response.status).toBe(409);
  });

  it('returns field-level validation errors', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'x', email: 'not-an-email', password: 'weak' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const paths = response.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toContain('name');
    expect(paths).toContain('email');
    expect(paths).toContain('password');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('signs in with correct credentials', async () => {
    const user = await createStudent({ password: 'Password123' });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Password123' });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(user.email);
  });

  it('returns the same error for a wrong password and an unknown email', async () => {
    const user = await createStudent({ password: 'Password123' });

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Password124' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical body: the endpoint must not reveal whether the account exists.
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.message).toBe('Invalid email or password.');
  });

  it('records a session row so the cookie can be revoked', async () => {
    const user = await createStudent();
    await signIn(user);

    const sessions = await prisma.session.count({ where: { userId: user.id, revokedAt: null } });
    expect(sessions).toBe(1);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the signed-in account', async () => {
    const { agent, user } = await signedInStudent();
    const response = await agent.get('/api/v1/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(user.id);
  });

  it('rejects an anonymous caller with 401 UNAUTHENTICATED', async () => {
    const response = await anonymous().get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged cookie', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'examprep_session=not.a.real.token');

    expect(response.status).toBe(401);
  });

  it('reflects a role change immediately, without waiting for the cookie to expire', async () => {
    const { agent, user } = await signedInStudent();

    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });

    // The role is read from the user row on every request, not from the token.
    const response = await agent.get('/api/v1/admin/stats');
    expect(response.status).toBe(200);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the session so the cookie stops working', async () => {
    const { agent } = await signedInStudent();

    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await agent.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('succeeds even when there is no valid session', async () => {
    expect((await anonymous().post('/api/v1/auth/logout')).status).toBe(204);
  });

  it('logout-all revokes every session of the account', async () => {
    const user = await createStudent();
    const laptop = await signIn(user);
    const phone = await signIn(user);

    expect((await laptop.post('/api/v1/auth/logout-all')).status).toBe(204);
    expect((await phone.get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('profile and password management', () => {
  it('updates the display name', async () => {
    const { agent } = await signedInStudent();
    const response = await agent.patch('/api/v1/auth/me').send({ name: 'New Name' });

    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe('New Name');
  });

  it('rejects an empty display name', async () => {
    const { agent } = await signedInStudent();
    const response = await agent.patch('/api/v1/auth/me').send({ name: 'x' });

    expect(response.status).toBe(400);
  });

  it('changes the password and keeps the caller signed in', async () => {
    const user = await createStudent({ password: 'Password123' });
    const agent = await signIn(user);

    const response = await agent
      .post('/api/v1/auth/me/password')
      .send({ currentPassword: 'Password123', newPassword: 'BrandNewPass9' });

    expect(response.status).toBe(204);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);

    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'BrandNewPass9' });
    expect(relogin.status).toBe(200);
  });

  it('revokes other sessions when the password changes', async () => {
    const user = await createStudent({ password: 'Password123' });
    const laptop = await signIn(user);
    const stolen = await signIn(user);

    await laptop
      .post('/api/v1/auth/me/password')
      .send({ currentPassword: 'Password123', newPassword: 'BrandNewPass9' });

    expect((await stolen.get('/api/v1/auth/me')).status).toBe(401);
    expect((await laptop.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('refuses a password change without the current password', async () => {
    const user = await createStudent({ password: 'Password123' });
    const agent = await signIn(user);

    const response = await agent
      .post('/api/v1/auth/me/password')
      .send({ currentPassword: 'WrongPassword1', newPassword: 'BrandNewPass9' });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('currentPassword');
  });

  it('enforces the password policy on the new password', async () => {
    const user = await createStudent({ password: 'Password123' });
    const agent = await signIn(user);

    const response = await agent
      .post('/api/v1/auth/me/password')
      .send({ currentPassword: 'Password123', newPassword: 'short' });

    expect(response.status).toBe(400);
  });
});

describe('request hardening', () => {
  it('rejects a body larger than the configured limit', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'x'.repeat(200_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('blocks a state-changing request from a disallowed browser origin', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.com', password: 'Password123' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows a state-changing request from an allow-listed origin', async () => {
    const user = await createStudent({ password: 'Password123' });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:4200')
      .send({ email: user.email, password: 'Password123' });

    expect(response.status).toBe(200);
  });

  it('sets the expected security headers', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the error envelope for an unknown route', async () => {
    const response = await request(app).get('/api/v1/nope');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
