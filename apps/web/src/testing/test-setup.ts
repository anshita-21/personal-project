import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import type { Provider } from '@angular/core';
import { httpErrorInterceptor } from '../app/core/api/http-error.interceptor';

/**
 * Providers every component/service spec needs.
 *
 * `provideHttpClientTesting` replaces the real backend with a controllable
 * mock, so specs assert on the REQUEST the app makes (URL, method, body) as
 * well as on how it handles the response. No spec talks to a real server.
 *
 * The REAL error interceptor is installed, so specs see the same ApiError
 * objects the application sees - testing against raw HttpErrorResponse would
 * prove nothing about production behaviour.
 *
 * Change detection stays zone-based, matching the application configuration.
 */
export function testProviders(extra: Provider[] = []): Provider[] {
  return [
    provideHttpClient(withInterceptors([httpErrorInterceptor])),
    provideHttpClientTesting(),
    provideRouter([]),
    ...extra,
  ];
}

/**
 * Lets pending promises settle and re-renders.
 *
 * Needed because a native DOM `click()` in a spec runs outside the Angular
 * zone, so the async work it starts is not tracked by `whenStable()` alone.
 * One macrotask hop drains the microtask queue (the awaited HTTP promise),
 * after which change detection can see the new state.
 */
export async function settle(fixture: {
  detectChanges: () => void;
  whenStable: () => Promise<unknown>;
}): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
