import type { Router } from 'express';
import { ROUTE_MOUNTS } from '../app';

export interface RouteEntry {
  /** OpenAPI-style path, e.g. /api/v1/attempts/{id}/submit */
  path: string;
  /** Lower-case HTTP method. */
  method: string;
}

interface RouterLayer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
}

/**
 * Enumerates every REST route the application registers.
 *
 * Walks the declared mount table in app.ts and each router's own layer stack.
 * The only Express internal relied on is `router.stack[].route`, which is
 * stable across Express 4 and 5; the mount prefixes come from exported data
 * rather than from reverse-engineering compiled path matchers.
 *
 * Used by openapi.spec.ts to fail the build when a route is added without being
 * documented (or documented without existing).
 */
export function collectRoutes(): RouteEntry[] {
  const entries: RouteEntry[] = [];

  for (const mount of ROUTE_MOUNTS) {
    const stack = (mount.router as Router & { stack: RouterLayer[] }).stack ?? [];
    for (const layer of stack) {
      if (!layer.route) {
        continue;
      }
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const routePath of paths) {
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (!enabled || method === '_all') {
            continue;
          }
          entries.push({ path: toOpenApiPath(mount.prefix, routePath), method });
        }
      }
    }
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function toOpenApiPath(prefix: string, routePath: string): string {
  const joined = `${prefix}${routePath === '/' ? '' : routePath}`.replace(/\/{2,}/g, '/');
  // Express `:param` -> OpenAPI `{param}`
  return joined.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}
