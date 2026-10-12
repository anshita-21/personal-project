#!/usr/bin/env node
/**
 * ---------------------------------------------------------------------------
 * Local PostgreSQL control - cross platform, no Docker, no admin rights.
 *
 * Why this exists: the project needs a REAL PostgreSQL instance, but not every
 * machine has Docker or permission to install a database. This script drives
 * the PostgreSQL binaries that ship with the `@embedded-postgres/*` optional
 * dependencies, so `npm run db:up` gives a developer a real server on Windows,
 * macOS or Linux with nothing else installed.
 *
 * If you do have Docker, `docker compose up -d db` is an equivalent
 * alternative; set DATABASE_URL to port 5432 in that case (see .env.example).
 *
 * Two portability details that a shell script got wrong:
 *   * Windows has no Unix domain sockets, so `-k` must not be passed there.
 *   * The packages ship only initdb/pg_ctl/postgres - there is no `psql`. The
 *     databases are therefore created over the wire with Prisma's raw query
 *     API rather than by shelling out to a client that may not exist.
 *
 * Usage: node scripts/pg.mjs {start|stop|status|reset}
 * ---------------------------------------------------------------------------
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PGDATA = process.env.PGDATA_DIR ?? path.join(ROOT, '.pgdata');
const PORT = process.env.PGPORT ?? '55432';
const USER = process.env.PGUSER_NAME ?? 'examprep';
const PASSWORD = process.env.PGPASSWORD_VALUE ?? 'examprep';
const DATABASES = ['examprep', 'examprep_test', 'examprep_e2e'];

const IS_WINDOWS = process.platform === 'win32';
const EXE = IS_WINDOWS ? '.exe' : '';

/* -------------------------------------------------------------------------- */
/* Locating the binaries                                                       */
/* -------------------------------------------------------------------------- */

/** The @embedded-postgres package matching this machine, if it was installed. */
function embeddedBinDir() {
  const pkg = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${
    os.arch() === 'arm64' ? 'arm64' : 'x64'
  }`;
  const dir = path.join(ROOT, 'node_modules', pkg, 'native', 'bin');
  return fs.existsSync(path.join(dir, `pg_ctl${EXE}`)) ? dir : null;
}

/** A system PostgreSQL installation, as a fallback. */
function systemBinDir() {
  const candidates = [];

  const onPath = spawnSync(IS_WINDOWS ? 'where' : 'which', ['pg_ctl'], { encoding: 'utf8' });
  if (onPath.status === 0) {
    const first = onPath.stdout.split(/\r?\n/).find(Boolean);
    if (first) {
      candidates.push(path.dirname(first.trim()));
    }
  }

  for (const base of ['/usr/lib/postgresql', '/usr/local/pgsql', 'C:/Program Files/PostgreSQL']) {
    if (!fs.existsSync(base)) {
      continue;
    }
    for (const entry of fs.readdirSync(base)) {
      candidates.push(path.join(base, entry, 'bin'));
    }
  }

  return candidates.find((dir) => fs.existsSync(path.join(dir, `pg_ctl${EXE}`))) ?? null;
}

const BIN = embeddedBinDir() ?? systemBinDir();

if (!BIN) {
  console.error(
    [
      'ERROR: no PostgreSQL binaries found.',
      '',
      'Try one of:',
      '  1. npm install            (installs the embedded PostgreSQL for your platform)',
      '  2. docker compose up -d db (then set DATABASE_URL to port 5432 in .env)',
      '  3. install PostgreSQL 16+ and make sure pg_ctl is on your PATH',
      '',
      `Platform detected: ${process.platform}/${os.arch()}`,
    ].join('\n'),
  );
  process.exit(1);
}

const tool = (name) => path.join(BIN, `${name}${EXE}`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

/* -------------------------------------------------------------------------- */
/* Cluster lifecycle                                                           */
/* -------------------------------------------------------------------------- */

function isRunning() {
  const result = spawnSync(tool('pg_ctl'), ['-D', PGDATA, 'status'], { stdio: 'ignore' });
  return result.status === 0;
}

function initCluster() {
  if (fs.existsSync(path.join(PGDATA, 'PG_VERSION'))) {
    return;
  }
  console.log(`==> initdb ${PGDATA}`);
  fs.mkdirSync(PGDATA, { recursive: true });

  // The superuser password goes through a temporary file rather than the
  // command line, which would otherwise expose it in the process list.
  const pwfile = path.join(os.tmpdir(), `examprep-pw-${process.pid}`);
  fs.writeFileSync(pwfile, PASSWORD, { mode: 0o600 });
  try {
    const status = run(tool('initdb'), [
      '-D',
      PGDATA,
      '-U',
      USER,
      `--pwfile=${pwfile}`,
      '-E',
      'UTF8',
      '--auth-host=scram-sha-256',
    ]);
    if (status !== 0) {
      throw new Error('initdb failed');
    }
  } finally {
    fs.rmSync(pwfile, { force: true });
  }
}

function startCluster() {
  initCluster();

  if (isRunning()) {
    console.log(`==> PostgreSQL already running on 127.0.0.1:${PORT}`);
    return;
  }

  console.log(`==> starting PostgreSQL on 127.0.0.1:${PORT}`);
  // No `-k` on Windows: it has no Unix domain sockets and the server refuses
  // to start if one is requested.
  const serverOptions = IS_WINDOWS
    ? `-p ${PORT} -h 127.0.0.1`
    : `-p ${PORT} -h 127.0.0.1 -k ${PGDATA}`;

  const status = run(tool('pg_ctl'), [
    '-D',
    PGDATA,
    '-l',
    path.join(PGDATA, 'server.log'),
    '-o',
    serverOptions,
    '-w',
    'start',
  ]);

  if (status !== 0) {
    console.error(`!! PostgreSQL failed to start. See ${path.join(PGDATA, 'server.log')}`);
    process.exit(1);
  }
}

function stopCluster() {
  if (!isRunning()) {
    console.log('==> not running');
    return;
  }
  run(tool('pg_ctl'), ['-D', PGDATA, '-w', 'stop']);
  console.log('==> stopped');
}

/* -------------------------------------------------------------------------- */
/* Databases                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Creates the application, test and end-to-end databases.
 *
 * Uses Prisma (already a dependency) against the maintenance `postgres`
 * database, because the embedded packages ship no `psql` client and requiring
 * one would put the burden back on the developer's machine.
 */
async function createDatabases() {
  let PrismaClient;
  try {
    ({ PrismaClient } = await import('@prisma/client'));
  } catch {
    console.warn(
      '!! @prisma/client is not generated yet; skipping database creation.\n' +
        '   Run `npm run prisma:generate` then `npm run db:up` again.',
    );
    return;
  }

  const adminUrl = `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@127.0.0.1:${PORT}/postgres`;
  const prisma = new PrismaClient({ datasourceUrl: adminUrl });

  try {
    for (const name of DATABASES) {
      const existing = await prisma.$queryRawUnsafe(
        'select 1 from pg_database where datname = $1',
        name,
      );
      if (Array.isArray(existing) && existing.length > 0) {
        continue;
      }
      console.log(`==> creating database ${name}`);
      // The name is from the constant list above, never user input, and
      // CREATE DATABASE cannot take a bind parameter.
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const command = process.argv[2];

try {
  switch (command) {
    case 'start': {
      startCluster();
      await createDatabases();
      console.log(`==> ready: postgresql://${USER}:***@127.0.0.1:${PORT}/examprep`);
      break;
    }
    case 'stop':
      stopCluster();
      break;
    case 'status':
      if (isRunning()) {
        console.log(`running on 127.0.0.1:${PORT}`);
      } else {
        console.log('stopped');
        process.exit(1);
      }
      break;
    case 'reset': {
      stopCluster();
      fs.rmSync(PGDATA, { recursive: true, force: true });
      console.log(`==> wiped ${PGDATA}`);
      startCluster();
      await createDatabases();
      break;
    }
    default:
      console.error('usage: node scripts/pg.mjs {start|stop|status|reset}');
      process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
