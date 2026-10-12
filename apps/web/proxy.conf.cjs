/**
 * Dev-server proxy.
 *
 * The SPA calls the API on its OWN origin (/api, /graphql) in every
 * environment, which keeps the session cookie first-party and sidesteps
 * cross-site cookie restrictions entirely. In development that is achieved with
 * this proxy; in production the two are served behind the same origin.
 *
 * The target is configurable so the end-to-end suite can point the dev server
 * at its own API instance on a different port.
 */
const target = process.env.API_PROXY_TARGET || 'http://localhost:3000';

module.exports = {
  '/api': { target, secure: false, changeOrigin: false, logLevel: 'warn' },
  '/graphql': { target, secure: false, changeOrigin: false, logLevel: 'warn' },
};
