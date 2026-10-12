import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../notifications/toast.service';
import { ApiError, NETWORK_ERROR_MESSAGE } from './api-error';

/**
 * Paths whose 401 is expected and must NOT trigger a redirect:
 *   /auth/me    - the startup probe; a 401 just means "not signed in".
 *   /auth/login - a wrong password is the user's problem, not a lost session.
 */
const SILENT_401 = [/\/auth\/me$/, /\/auth\/login$/];

/**
 * Turns every HTTP failure into an ApiError and handles the two cases that
 * should never be a component's job:
 *
 *   * A 401 on a protected call means the cookie is gone or was revoked. The
 *     local session is cleared and the user is sent to the sign-in page with a
 *     returnUrl, so they come back to where they were.
 *   * A 5xx or network failure gets a toast, because no component has anything
 *     more useful to say about it.
 *
 * Everything else is rethrown for the caller to render in context - a 400 on a
 * form belongs next to the field, not in a toast.
 */
export const httpErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toasts = inject(ToastService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      // status 0 means the request never got a response: offline, DNS, CORS.
      if (error.status === 0) {
        toasts.error(NETWORK_ERROR_MESSAGE);
        return throwError(
          () => new ApiError(0, 'INTERNAL_ERROR', NETWORK_ERROR_MESSAGE),
        );
      }

      const apiError = ApiError.from(
        error.status,
        error.error,
        error.status >= 500 ? 'Something went wrong on our side.' : 'The request was rejected.',
      );

      const silent = SILENT_401.some((pattern) => pattern.test(request.url));
      if (apiError.status === 401 && !silent) {
        auth.clearSession();
        toasts.error('Your session has ended. Please sign in again.');
        void router.navigate(['/login'], {
          queryParams: { returnUrl: router.url },
        });
      }

      if (apiError.status >= 500) {
        toasts.error(apiError.message);
      }

      if (apiError.status === 429) {
        toasts.error(apiError.message);
      }

      return throwError(() => apiError);
    }),
  );
};
