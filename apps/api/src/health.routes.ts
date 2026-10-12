import { Router } from 'express';
import { prisma } from './db/prisma';
import { asyncHandler } from './middleware/async-handler';
import { logger } from './logger';

export const healthRouter = Router();

/**
 * Liveness + dependency probe.
 *
 * Returns 503 (not 500) when the database is unreachable so a load balancer or
 * ECS health check takes the task out of rotation instead of serving errors.
 * The probe is cheap on purpose - `SELECT 1` - because it runs constantly.
 */
healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let database: 'up' | 'down' = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      database = 'down';
      logger.error({ err: error }, 'health check: database unreachable');
    }

    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      database,
      version: process.env['npm_package_version'] ?? '1.0.0',
    });
  }),
);
