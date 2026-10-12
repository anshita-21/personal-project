import { PrismaClient } from '@prisma/client';
import { env, isTest } from '../config/env';
import { logger } from '../logger';

/**
 * A single PrismaClient for the process.
 *
 * Each client owns a connection pool, so constructing one per request (or per
 * module) exhausts Postgres connections under load. The `globalThis` cache
 * keeps hot-reload (tsx watch) and Jest module resets from piling up pools.
 *
 * `datasourceUrl` is passed EXPLICITLY and is not optional. Left out, Prisma
 * reads `DATABASE_URL` straight from process.env and ignores the validated,
 * environment-resolved value in `env` - which means the integration suite
 * (which swaps in TEST_DATABASE_URL) would silently connect to, and truncate,
 * the development database. The configuration module is the single source of
 * truth for which database this process talks to.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
    log: isTest ? [] : [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }],
  });

if (!isTest) {
  prisma.$on('warn' as never, (event: unknown) => logger.warn({ event }, 'prisma warning'));
  prisma.$on('error' as never, (event: unknown) => logger.error({ event }, 'prisma error'));
}

globalForPrisma.prisma = prisma;

/** Shared transaction client type, so services can accept either client. */
export type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
