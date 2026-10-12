import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import type { AuthResponse, UserView } from '@examprep/shared';
import { testProviders } from '../../../testing/test-setup';
import { AuthService } from './auth.service';

const student: UserView = {
  id: 'u1',
  name: 'Priya Raman',
  email: 'priya@example.com',
  role: 'STUDENT',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const admin: UserView = { ...student, id: 'u2', name: 'Alex Admin', role: 'ADMIN' };

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: testProviders() });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts with no user and an unresolved session', () => {
    expect(service.user()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.sessionResolved()).toBe(false);
  });

  describe('restoreSession', () => {
    it('adopts the user the server reports', async () => {
      const restored = service.restoreSession();
      http.expectOne({ method: 'GET', url: '/api/v1/auth/me' }).flush({ user: student });
      await restored;

      expect(service.user()).toEqual(student);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.sessionResolved()).toBe(true);
    });

    it('treats a 401 as "not signed in" rather than an error', async () => {
      const restored = service.restoreSession();
      http
        .expectOne('/api/v1/auth/me')
        .flush({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }, {
          status: 401,
          statusText: 'Unauthorized',
        });
      await expect(restored).resolves.toBeUndefined();

      expect(service.user()).toBeNull();
      // Critically, the probe still RESOLVES - otherwise app bootstrap would
      // hang and the router would never activate a route.
      expect(service.sessionResolved()).toBe(true);
    });
  });

  describe('login', () => {
    it('posts the credentials and stores the returned user', async () => {
      const promise = service.login({ email: 'priya@example.com', password: 'Password123' });
      const request = http.expectOne('/api/v1/auth/login');

      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        email: 'priya@example.com',
        password: 'Password123',
      });
      request.flush({ user: student } satisfies AuthResponse);

      await expect(promise).resolves.toEqual(student);
      expect(service.isAuthenticated()).toBe(true);
    });

    it('leaves the session empty when the credentials are rejected', async () => {
      const promise = service.login({ email: 'priya@example.com', password: 'wrong' });
      http.expectOne('/api/v1/auth/login').flush(
        { error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password.' } },
        { status: 401, statusText: 'Unauthorized' },
      );

      await expect(promise).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(service.user()).toBeNull();
    });
  });

  it('exposes isAdmin from the role the server sent', async () => {
    const promise = service.login({ email: 'a@b.com', password: 'Password123' });
    http.expectOne('/api/v1/auth/login').flush({ user: admin });
    await promise;

    expect(service.isAdmin()).toBe(true);
  });

  it('derives the display name from the current user', async () => {
    const promise = service.login({ email: 'a@b.com', password: 'Password123' });
    http.expectOne('/api/v1/auth/login').flush({ user: student });
    await promise;

    expect(service.displayName()).toBe('Priya Raman');
  });

  describe('logout', () => {
    it('clears the user after the server confirms', async () => {
      const login = service.login({ email: 'a@b.com', password: 'Password123' });
      http.expectOne('/api/v1/auth/login').flush({ user: student });
      await login;

      const promise = service.logout();
      http.expectOne({ method: 'POST', url: '/api/v1/auth/logout' }).flush(null);
      await promise;

      expect(service.user()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('clears the user even if the logout request fails', async () => {
      const login = service.login({ email: 'a@b.com', password: 'Password123' });
      http.expectOne('/api/v1/auth/login').flush({ user: student });
      await login;

      const promise = service.logout();
      http
        .expectOne('/api/v1/auth/logout')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await promise.catch(() => undefined);

      // The user asked to be signed out; leaving stale state on screen would be
      // worse than a failed request they cannot see.
      expect(service.user()).toBeNull();
    });
  });

  it('updates the stored user when the profile changes', async () => {
    const login = service.login({ email: 'a@b.com', password: 'Password123' });
    http.expectOne('/api/v1/auth/login').flush({ user: student });
    await login;

    const promise = service.updateProfile({ name: 'Priya R' });
    const request = http.expectOne('/api/v1/auth/me');
    expect(request.request.method).toBe('PATCH');
    request.flush({ user: { ...student, name: 'Priya R' } });
    await promise;

    expect(service.displayName()).toBe('Priya R');
  });

  it('posts a password change without touching the stored user', async () => {
    const promise = service.changePassword({
      currentPassword: 'Password123',
      newPassword: 'NewPassword123',
    });
    const request = http.expectOne('/api/v1/auth/me/password');

    expect(request.request.method).toBe('POST');
    request.flush(null);
    await promise;

    expect(service.user()).toBeNull();
  });

  it('clearSession drops local state without calling the server', () => {
    service.clearSession();
    expect(service.user()).toBeNull();
    http.expectNone(() => true);
  });
});
