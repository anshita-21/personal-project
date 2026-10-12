import rateLimit, { type Options } from 'express-rate-limit';
import type { ApiErrorBody } from '@examprep/shared';
import { rateLimitEnabled } from '../config/env';

const tooManyRequests: ApiErrorBody = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again.' },
};

/**
 * Rate limiting is off by default under NODE_ENV=test: an integration suite
 * issues hundreds of requests from one address in seconds, and a limiter would
 * make the suite's failures depend on test ordering rather than on behaviour.
 * `RATE_LIMIT_ENABLED=true` forces it back on, which is how tests/rate-limit.spec.ts
 * proves the limiter really does return 429.
 */
function limiter(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooManyRequests,
    skip: () => !rateLimitEnabled,
    ...options,
  });
}

/**
 * Sensitive endpoints: login, register, password change. Tight, because these
 * are the endpoints worth brute-forcing.
 * `skipSuccessfulRequests` means a legitimate user who signs in correctly does
 * not spend budget; only failures count towards the limit.
 */
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

/** Account creation, limited per address regardless of outcome. */
export const registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
});

/**
 * Everything else. Generous on purpose: the exam runner autosaves, so a normal
 * session is chatty and must never be throttled mid-exam.
 */
export const globalLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 600,
});

/** Writes by admins (exam authoring). Low volume by nature. */
export const adminWriteLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 120,
});
