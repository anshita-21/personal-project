import { InjectionToken } from '@angular/core';

/**
 * Base URL for the API.
 *
 * Empty by default, i.e. same origin: in development the Angular dev server
 * proxies /api and /graphql to the API (proxy.conf.json), and in production the
 * SPA is served behind the same origin as the API. Both avoid third-party
 * cookie problems entirely, which a cookie-authenticated SPA on a separate
 * origin would otherwise have to fight.
 *
 * Provided as a token so a different deployment can override it without the
 * services knowing (see docs/deployment.md).
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '',
});

export const API_V1 = '/api/v1';
export const GRAPHQL_PATH = '/graphql';
