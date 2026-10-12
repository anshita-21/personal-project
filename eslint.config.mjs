import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/web/src/polyfills.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    // Developer tooling: Node scripts that are supposed to print progress.
    files: [
      'prisma/**/*.ts',
      'scripts/**/*.{ts,mjs}',
      'e2e/global-setup.ts',
      '**/*.config.{ts,mjs}',
      '**/jest.setup.ts',
    ],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.spec.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Specs occasionally need a synchronous require to re-import a module
      // with different environment configuration (see rate-limit.spec.ts).
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Jest and PostCSS style configs that must be CommonJS scripts.
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off', 'no-undef': 'off' },
  },
  prettier,
);
