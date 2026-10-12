import type { ComponentFixture} from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { settle, testProviders } from '../../../testing/test-setup';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: testProviders() });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LoginPage);
    await settle(fixture);
  });

  afterEach(() => http.verify());

  const el = () => fixture.nativeElement as HTMLElement;
  const input = (id: string) => el().querySelector<HTMLInputElement>(`#${id}`)!;
  const submitButton = () =>
    el().querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!;

  function fill(email: string, password: string): void {
    input('email').value = email;
    input('email').dispatchEvent(new Event('input'));
    input('password').value = password;
    input('password').dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('renders the form', () => {
    expect(input('email')).toBeTruthy();
    expect(input('password')).toBeTruthy();
    expect(submitButton().textContent).toContain('Sign in');
  });

  it('does not call the API when the form is empty', () => {
    submitButton().click();
    fixture.detectChanges();

    http.expectNone('/api/v1/auth/login');
    expect(el().textContent).toContain('Email is required.');
  });

  it('shows a field error for a malformed email', () => {
    fill('not-an-email', 'Password123');
    submitButton().click();
    fixture.detectChanges();

    expect(el().textContent).toContain('Enter a valid email address.');
    http.expectNone('/api/v1/auth/login');
  });

  it('posts the credentials and navigates to the dashboard on success', async () => {
    fill('priya@example.com', 'Password123');
    submitButton().click();

    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.body).toEqual({
      email: 'priya@example.com',
      password: 'Password123',
    });
    request.flush({
      user: {
        id: 'u1',
        name: 'Priya Raman',
        email: 'priya@example.com',
        role: 'STUDENT',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await settle(fixture);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the server message when the credentials are wrong', async () => {
    fill('priya@example.com', 'WrongPassword1');
    submitButton().click();

    http.expectOne('/api/v1/auth/login').flush(
      { error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password.' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    await settle(fixture);

    const banner = el().querySelector('[data-testid="login-error"]');
    expect(banner?.textContent).toContain('Invalid email or password.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('disables the submit button while the request is in flight', async () => {
    fill('priya@example.com', 'Password123');
    submitButton().click();
    fixture.detectChanges();

    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain('Signing in');

    http.expectOne('/api/v1/auth/login').flush({
      user: {
        id: 'u1',
        name: 'Priya',
        email: 'priya@example.com',
        role: 'STUDENT',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await settle(fixture);
  });

  it('respects a same-site returnUrl so the user lands back where they were', async () => {
    jest.spyOn(router, 'parseUrl').mockReturnValue({
      queryParams: { returnUrl: '/exams/javascript-essentials' },
    } as never);

    fill('priya@example.com', 'Password123');
    submitButton().click();
    http.expectOne('/api/v1/auth/login').flush({
      user: {
        id: 'u1',
        name: 'Priya',
        email: 'priya@example.com',
        role: 'STUDENT',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await settle(fixture);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/exams/javascript-essentials');
  });

  it('ignores an absolute returnUrl - that would be an open redirect', async () => {
    jest.spyOn(router, 'parseUrl').mockReturnValue({
      queryParams: { returnUrl: 'https://evil.example/phish' },
    } as never);

    fill('priya@example.com', 'Password123');
    submitButton().click();
    http.expectOne('/api/v1/auth/login').flush({
      user: {
        id: 'u1',
        name: 'Priya',
        email: 'priya@example.com',
        role: 'STUDENT',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await settle(fixture);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('ignores a protocol-relative returnUrl', async () => {
    jest.spyOn(router, 'parseUrl').mockReturnValue({
      queryParams: { returnUrl: '//evil.example/phish' },
    } as never);

    fill('priya@example.com', 'Password123');
    submitButton().click();
    http.expectOne('/api/v1/auth/login').flush({
      user: {
        id: 'u1',
        name: 'Priya',
        email: 'priya@example.com',
        role: 'STUDENT',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await settle(fixture);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('prefills the demo credentials without submitting', () => {
    const buttons = Array.from(el().querySelectorAll('button')) as HTMLButtonElement[];
    const studentButton = buttons.find((button) => button.textContent?.trim() === 'Student');
    studentButton?.click();
    fixture.detectChanges();

    expect(input('email').value).toBe('student@examprep.dev');
    http.expectNone('/api/v1/auth/login');
  });
});
