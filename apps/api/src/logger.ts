import pino from 'pino';
import { env, isProduction, isTest } from './config/env';

/**
 * Structured logging.
 *
 * `redact` is not decoration: request bodies and headers routinely carry
 * passwords and session cookies, and a log line is the easiest way to leak a
 * credential into a log aggregator that is backed up forever.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'password',
      'newPassword',
      'currentPassword',
      'passwordHash',
      '*.password',
      '*.passwordHash',
    ],
    censor: '[redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export type Logger = typeof logger;
