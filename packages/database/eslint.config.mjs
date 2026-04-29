import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ignores: ['**/out-tsc'],
  },
  {
    // drizzle-kit config files are dev-time scripts that read env vars at module
    // load. Non-null assertions on env reads are idiomatic here and never run
    // in production code paths.
    files: ['**/*.config.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
