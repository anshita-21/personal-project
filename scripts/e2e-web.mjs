#!/usr/bin/env node
/**
 * Starts the Angular dev server for the end-to-end suite.
 *
 * A Node wrapper rather than a shell one-liner because npm runs package
 * scripts through cmd.exe on Windows, where POSIX `${VAR:-default}` expansion
 * is not available. Port and proxy target come from the environment that
 * playwright.config.ts passes in, so there is a single source of truth.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.E2E_WEB_PORT ?? '4300';
const apiPort = process.env.E2E_API_PORT ?? '3100';

const child = spawn(
  'npm',
  ['run', 'start', '-w', '@examprep/web', '--', '--port', port, '--host', '127.0.0.1'],
  {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      API_PROXY_TARGET: process.env.API_PROXY_TARGET ?? `http://127.0.0.1:${apiPort}`,
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
