import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env, isAllowedOrigin, isTest } from './config/env';
import { logger } from './logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { globalLimiter } from './middleware/rate-limit';
import { verifyRequestOrigin } from './middleware/request-origin';
import { authRouter } from './modules/auth/auth.routes';
import { examRouter } from './modules/exams/exam.routes';
import { attemptRouter } from './modules/attempts/attempt.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { graphqlRouter } from './graphql';
import { healthRouter } from './health.routes';
import { openApiDocument } from './docs/openapi';

/**
 * Builds the Express application.
 *
 * Exported as a factory with no side effects (no listen, no process handlers)
 * so the integration suite can mount it with Supertest without binding a port.
 * `server.ts` owns the process concerns.
 *
 * Middleware order is deliberate and is the security posture of the service:
 *   1. trust proxy      - so rate limiting and logs see the real client IP
 *   2. helmet           - security headers before anything can respond
 *   3. cors             - reject disallowed origins early
 *   4. body parser      - with a hard size limit
 *   5. cookie parser    - needed by authentication
 *   6. request logging
 *   7. global rate limit
 *   8. origin check     - CSRF defence in depth on state-changing methods
 *   9. routes
 *  10. 404 then the central error handler, last
 */
/**
 * Where each feature router is mounted. Exported so tooling and tests can
 * enumerate the REST surface without reaching into Express internals.
 */
export const ROUTE_MOUNTS = [
  { prefix: '/api', router: healthRouter },
  { prefix: '/api/v1/auth', router: authRouter },
  { prefix: '/api/v1', router: examRouter },
  { prefix: '/api/v1/attempts', router: attemptRouter },
  { prefix: '/api/v1/admin', router: adminRouter },
  { prefix: '/graphql', router: graphqlRouter },
] as const;

export function createApp(): Express {
  const app = express();

  // Behind an ALB/CloudFront the client address is in X-Forwarded-For. Without
  // this, every request looks like it comes from the proxy and the rate limiter
  // throttles all users as one.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON, not pages, so a restrictive default CSP is right.
      // The Swagger UI route relaxes it for itself below.
      contentSecurityPolicy: { useDefaults: true, directives: { 'frame-ancestors': ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(
    cors({
      // An allow-list, never a reflected wildcard: `credentials: true` with a
      // reflected origin would let any site read authenticated responses.
      origin(origin, callback) {
        // Reflecting the origin only when it is allowed. A disallowed origin
        // gets NO Access-Control-Allow-Origin header (so the browser blocks the
        // response) rather than an exception - throwing here would surface as a
        // 500 instead of a clean, documented rejection.
        callback(null, !origin || isAllowedOrigin(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        // Health checks are high-volume and uninteresting when they pass.
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        customProps: (req) => ({ userId: (req as express.Request).auth?.userId }),
      }),
    );
  }

  app.use(globalLimiter);
  app.use(verifyRequestOrigin);

  // ---- API documentation -------------------------------------------------
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/api/docs',
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Swagger UI needs inline styles/scripts, which the global CSP forbids.
      // Relaxing it only for this path keeps the API's own headers strict.
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
      );
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Exam Prep API',
      swaggerOptions: { withCredentials: true, persistAuthorization: true },
    }),
  );

  // ---- Routes ------------------------------------------------------------
  // Mounted from a declared table rather than ad-hoc `app.use` calls so the
  // route inventory (used by the OpenAPI drift test) is derived from the same
  // source of truth that wires the app. See docs/route-inventory.ts.
  for (const mount of ROUTE_MOUNTS) {
    app.use(mount.prefix, mount.router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
