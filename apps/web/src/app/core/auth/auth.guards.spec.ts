import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { HttpTestingController } from '@angular/common/http/testing';
import type { UserView } from '@examprep/shared';
import { testProviders } from '../../../testing/test-setup';
import { ToastService } from '../notifications/toast.service';
import { AuthService } from './auth.service';
import { adminGuard, authGuard, guestGuard } from './auth.guards';

const route = {} as ActivatedRouteSnapshot;
const state = (url: string) => ({ url }) as RouterStateSnapshot;

describe('route guards', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: testProviders() });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  async function signInAs(role: 'STUDENT' | 'ADMIN'): Promise<void> {
    const user: UserView = {
      id: 'u1',
      name: 'Test User',
      email: 'test@example.com',
      role,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const promise = auth.login({ email: user.email, password: 'Password123' });
    http.expectOne('/api/v1/auth/login').flush({ user });
    await promise;
  }

  function run(guard: typeof authGuard, url = '/dashboard'): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => guard(route, state(url)) as boolean | UrlTree,
    );
  }

  describe('authGuard', () => {
    it('allows a signed-in user through', async () => {
      await signInAs('STUDENT');
      expect(run(authGuard)).toBe(true);
    });

    it('redirects an anonymous visitor to login, preserving where they were going', () => {
      const result = run(authGuard, '/attempts/abc/take');

      expect(result).toBeInstanceOf(UrlTree);
      const tree = result as UrlTree;
      expect(router.serializeUrl(tree)).toContain('/login');
      expect(router.serializeUrl(tree)).toContain('returnUrl=%2Fattempts%2Fabc%2Ftake');
    });
  });

  describe('adminGuard', () => {
    it('allows an administrator through', async () => {
      await signInAs('ADMIN');
      expect(run(adminGuard, '/admin')).toBe(true);
    });

    it('sends a signed-in student back to their dashboard with an explanation', async () => {
      await signInAs('STUDENT');
      const result = run(adminGuard, '/admin');

      expect(router.serializeUrl(result as UrlTree)).toBe('/dashboard');
      expect(TestBed.inject(ToastService).toasts()[0]?.message).toContain('administrators only');
    });

    it('sends an anonymous visitor to login, not to the dashboard', () => {
      const result = run(adminGuard, '/admin/exams');
      expect(router.serializeUrl(result as UrlTree)).toContain('/login');
    });
  });

  describe('guestGuard', () => {
    it('lets an anonymous visitor reach the login page', () => {
      expect(run(guestGuard, '/login')).toBe(true);
    });

    it('bounces a signed-in user away from the login page', async () => {
      await signInAs('STUDENT');
      const result = run(guestGuard, '/login');
      expect(router.serializeUrl(result as UrlTree)).toBe('/dashboard');
    });
  });
});
