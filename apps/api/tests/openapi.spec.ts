import request from 'supertest';
import { collectRoutes } from '../src/docs/route-inventory';
import { openApiDocument } from '../src/docs/openapi';
import { app } from './helpers';

/**
 * The anti-drift test.
 *
 * docs/openapi.ts is hand-written, which is a deliberate trade-off (no extra
 * dependency, full control over the published contract) with one obvious risk:
 * the document silently falling out of step with the code. This test removes
 * that risk by comparing the document against the routes Express actually has.
 *
 * If you add a route, this test fails until you document it. If you remove one,
 * it fails until you delete the documentation.
 */

/** GraphQL is documented separately (docs/api.md + the SDL endpoint). */
const EXCLUDED = new Set(['/api/docs.json', '/graphql', '/graphql/schema.graphql']);

const documented = new Set<string>();
for (const [path, operations] of Object.entries(openApiDocument.paths)) {
  for (const method of Object.keys(operations)) {
    documented.add(`${method.toUpperCase()} ${path}`);
  }
}

const implemented = new Set(
  collectRoutes()
    .filter((route) => !EXCLUDED.has(route.path))
    .map((route) => `${route.method.toUpperCase()} ${route.path}`),
);

describe('OpenAPI document', () => {
  it('documents every implemented REST route', () => {
    const undocumented = [...implemented].filter((route) => !documented.has(route)).sort();
    expect(undocumented).toEqual([]);
  });

  it('does not document routes that do not exist', () => {
    const phantom = [...documented].filter((route) => !implemented.has(route)).sort();
    expect(phantom).toEqual([]);
  });

  it('describes at least one response for every operation', () => {
    const missing: string[] = [];
    for (const [path, operations] of Object.entries(openApiDocument.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const responses = (operation as { responses?: Record<string, unknown> }).responses;
        if (!responses || Object.keys(responses).length === 0) {
          missing.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every operation a summary and a tag', () => {
    const incomplete: string[] = [];
    for (const [path, operations] of Object.entries(openApiDocument.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const typed = operation as { summary?: string; tags?: string[] };
        if (!typed.summary || !typed.tags?.length) {
          incomplete.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect(incomplete).toEqual([]);
  });

  it('resolves every internal $ref to a declared component schema', () => {
    const declared = new Set(Object.keys(openApiDocument.components.schemas));
    const refs = new Set<string>();

    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node === null || typeof node !== 'object') {
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') {
          refs.add(value.replace('#/components/schemas/', ''));
        } else {
          walk(value);
        }
      }
    };
    walk(openApiDocument.paths);
    walk(openApiDocument.components.schemas);

    const dangling = [...refs].filter((ref) => !declared.has(ref)).sort();
    expect(dangling).toEqual([]);
  });

  it('is served as JSON at /api/docs.json', async () => {
    const response = await request(app).get('/api/docs.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.info.title).toContain('Exam Prep');
  });

  it('serves the Swagger UI at /api/docs', async () => {
    const response = await request(app).get('/api/docs/').redirects(1);

    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger');
  });

  it('declares the cookie security scheme the API actually uses', () => {
    expect(openApiDocument.components.securitySchemes.sessionCookie).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'examprep_session',
    });
  });
});

describe('GET /api/health', () => {
  it('reports database connectivity', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(typeof response.body.uptimeSeconds).toBe('number');
  });
});
