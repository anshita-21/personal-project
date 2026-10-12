import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { ToastService } from '../notifications/toast.service';

/**
 * Route guards.
 *
 * These are a USER EXPERIENCE measure - they keep a signed-out visitor from
 * landing on an empty dashboard. They are not the security boundary: every
 * protected endpoint re-checks authentication and role on the server, and the
 * admin API returns 403 to a student regardless of what the browser allows.
 * A guard can be bypassed by editing client-side code; the API cannot.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toasts = inject(ToastService);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (!auth.isAdmin()) {
    toasts.error('That area is for administrators only.');
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};

/** Keeps an already signed-in user off the login and register screens. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};
