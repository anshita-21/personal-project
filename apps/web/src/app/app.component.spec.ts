import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import type { UserView } from '@examprep/shared';
import { settle, testProviders } from '../testing/test-setup';
import { AppComponent } from './app.component';
import { AuthService } from './core/auth/auth.service';

function user(overrides: Partial<UserView> = {}): UserView {
  return {
    id: 'u1',
    name: 'Priya Raman',
    email: 'priya@example.com',
    role: 'STUDENT',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AppComponent (shell)', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: testProviders() });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  afterEach(() => http.verify({ ignoreCancelled: true }));

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const avatar = () => (fixture.nativeElement as HTMLElement).querySelector('.avatar')?.textContent;

  async function signIn(as: UserView): Promise<void> {
    const promise = auth.login({ email: as.email, password: 'Password123' });
    http.expectOne('/api/v1/auth/login').flush({ user: as });
    await promise;
    await settle(fixture);
  }

  it('offers sign-in and registration to an anonymous visitor', () => {
    expect(text()).toContain('Sign in');
    expect(text()).toContain('Create account');
    expect(text()).not.toContain('Sign out');
  });

  it('shows the learner navigation once signed in', async () => {
    await signIn(user());

    expect(text()).toContain('Dashboard');
    expect(text()).toContain('My attempts');
    expect(text()).toContain('Sign out');
    // The admin entry is not offered to a student.
    expect(text()).not.toContain('Admin');
  });

  it('shows the admin entry only for an administrator', async () => {
    await signIn(user({ name: 'Alex Morgan (Admin)', role: 'ADMIN' }));
    expect(text()).toContain('Admin');
  });

  it('builds initials from letters only', async () => {
    await signIn(user({ name: 'Priya Raman' }));
    expect(avatar()).toBe('PR');
  });

  it('ignores punctuation in a display name when building initials', async () => {
    // "Alex Morgan (Admin)" must not render as "A(".
    await signIn(user({ name: 'Alex Morgan (Admin)', role: 'ADMIN' }));
    expect(avatar()).toBe('AA');
  });

  it('uses a single initial for a one-word name', async () => {
    await signIn(user({ name: 'Prince' }));
    expect(avatar()).toBe('P');
  });

  it('falls back to a placeholder when the name has no letters', async () => {
    await signIn(user({ name: '!!!' }));
    expect(avatar()).toBe('?');
  });
});
