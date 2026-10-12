import { createApp } from './app';
import { env } from './config/env';
import { disconnectPrisma, prisma } from './db/prisma';
import { logger } from './logger';

/**
 * Process entry point. Owns everything `createApp` deliberately does not:
 * binding the port, verifying the database is reachable at boot, and shutting
 * down cleanly.
 */
async function main(): Promise<void> {
  const app = createApp();

  // Fail fast at boot rather than returning 500s to the first real user.
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('database connection verified');
  } catch (error) {
    logger.error(
      { err: error },
      'cannot reach the database - check DATABASE_URL and that Postgres is running (npm run db:up)',
    );
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `API listening on http://localhost:${env.PORT} (docs: /api/docs)`,
    );
  });

  // Graceful shutdown: stop accepting connections, let in-flight requests
  // finish, then release the database pool. Without this, a rolling deploy can
  // drop requests mid-flight and leak connections.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async (error) => {
      if (error) {
        logger.error({ err: error }, 'error while closing HTTP server');
      }
      await disconnectPrisma();
      process.exit(error ? 1 : 0);
    });

    // Last resort: do not hang forever on a stuck connection.
    setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });
}

void main();
