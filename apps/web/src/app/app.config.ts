import type {
  ApplicationConfig} from '@angular/core';
import {
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  inject,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { httpErrorInterceptor } from './core/api/http-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),

    provideRouter(
      routes,
      // Route params arrive as signal inputs on the page components, so pages
      // do not each re-implement "read the id from the snapshot".
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),

    provideHttpClient(
      withFetch(),
      // The auth cookie is httpOnly and same-origin (dev uses a proxy), so no
      // withCredentials juggling is needed - the browser attaches it.
      withInterceptors([httpErrorInterceptor]),
    ),

    /**
     * Resolve the session BEFORE the first route activates. Without this the
     * router would run guards against an unknown session and bounce a
     * signed-in user to the login page on every hard refresh.
     */
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
};
