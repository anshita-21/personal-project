/**
 * jest-preset-angular compiles each spec with the Angular compiler, so
 * components are tested with their real templates and `strictTemplates` rather
 * than through a mocked rendering layer - a template typo fails the test run.
 *
 * CommonJS rather than jest.config.ts: jest-preset-angular ships a CJS-only
 * `presets` entry point, which an ESM-parsed .ts config cannot import.
 *
 * `@examprep/shared` is mapped to its SOURCE so the web tests do not depend on
 * the shared package having been built first.
 */
const { createCjsPreset } = require('jest-preset-angular/presets');

const preset = createCjsPreset({
  tsconfig: '<rootDir>/tsconfig.spec.json',
  // 151002: ts-jest's "hybrid module kind" notice; the spec tsconfig already
  // uses commonjs, so it does not apply here.
  diagnostics: { ignoreCodes: [151002] },
});

module.exports = {
  ...preset,
  displayName: 'web',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@examprep/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  collectCoverageFrom: ['src/app/**/*.ts', '!src/app/**/*.spec.ts', '!src/testing/**'],
  coverageReporters: ['text-summary', 'lcov'],
  clearMocks: true,
};
