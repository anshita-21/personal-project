import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { testProviders } from '../../../testing/test-setup';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../notifications/toast.service';
import { ApiError } from './api-error';

describe('httpErrorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let toasts: ToastService;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: testProviders() });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    toasts = TestBed.inject(ToastService);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => backend.verify());

  function failWith(url: string, status: number, body: unknown): Promise<unknown> {
    const promise = firstValueFrom(http.get(url)).catch((error: unknown) => error);
    backend.expectOne(url).flush(body, { status, statusText: 'Error' });
    return promise;
  }

  it('converts the API error envelope into an ApiError', async () => {
    const error = await failWith('/api/v1/exams', 400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request contains invalid data.',
        details: [{ path: 'page', message: 'Too small' }],
      },
    });

    expect(ApiError.isApiError(error)).toBe(true);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe('VALIDATION_ERROR');
    expect(apiError.detailFor('page')).toBe('Too small');
  });

  it('does not toast a 4xx - the component shows it in context', async () => {
    await failWith('/api/v1/exams', 400, {
      error: { code: 'VALIDATION_ERROR', message: 'nope' },
    });

    expect(toasts.toasts()).toHaveLength(0);
  });

  it('toasts a 5xx, because no component can explain it better', async () => {
    await failWith('/api/v1/exams', 500, {
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' },
    });

    expect(toasts.toasts()).toHaveLength(1);
    expect(toasts.toasts()[0]?.kind).toBe('error');
  });

  it('handles a network failure (status 0) with a readable message', async () => {
    const promise = firstValueFrom(http.get('/api/v1/exams')).catch((e: unknown) => e);
    backend.expectOne('/api/v1/exams').error(new ProgressEvent('error'), { status: 0 });
    const error = (await promise) as ApiError;

    expect(error.status).toBe(0);
    expect(error.message).toContain('Could not reach the server');
    expect(toasts.toasts()).toHaveLength(1);
  });

  it('clears the session and redirects on a 401 from a protected call', async () => {
    await failWith('/api/v1/attempts', 401, {
      error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
    });

    expect(router.navigate).toHaveBeenCalledWith(['/login'], expect.anything());
    expect(auth.user()).toBeNull();
    expect(toasts.toasts()[0]?.message).toContain('session has ended');
  });

  it('stays silent on a 401 from the startup session probe', async () => {
    await failWith('/api/v1/auth/me', 401, {
      error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
    });

    // A 401 here is the normal signed-out case, not a lost session.
    expect(router.navigate).not.toHaveBeenCalled();
    expect(toasts.toasts()).toHaveLength(0);
  });

  it('stays silent on a 401 from login - a wrong password is not a lost session', async () => {
    const promise = firstValueFrom(http.post('/api/v1/auth/login', {})).catch(
      (e: unknown) => e,
    );
    backend.expectOne('/api/v1/auth/login').flush(
      { error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password.' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    await promise;

    expect(router.navigate).not.toHaveBeenCalled();
    expect(toasts.toasts()).toHaveLength(0);
  });

  it('toasts a 429 so the user understands why nothing happened', async () => {
    await failWith('/api/v1/auth/login', 429, {
      error: { code: 'RATE_LIMITED', message: 'Too many requests.' },
    });

    expect(toasts.toasts()[0]?.message).toContain('Too many requests');
  });

  it('survives an error body that is not the expected envelope', async () => {
    const error = (await failWith('/api/v1/exams', 502, '<html>gateway</html>')) as ApiError;

    expect(ApiError.isApiError(error)).toBe(true);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.details).toEqual([]);
  });

  it('leaves successful responses untouched', async () => {
    const promise = firstValueFrom(http.get<{ ok: boolean }>('/api/health'));
    backend.expectOne('/api/health').flush({ ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
    expect(toasts.toasts()).toHaveLength(0);
  });
});
