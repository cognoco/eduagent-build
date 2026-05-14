const { join } = require('path');

// CI-only readability defaults — silence captured console output from passing
// tests + custom reporter for GitHub Actions annotations and end-of-log
// summary. See docs/superpowers/specs/2026-05-14-ci-failure-readability-design.md.
const ciDefaults = process.env.CI
  ? {
      silent: true,
      reporters: ['default', join(__dirname, '../../scripts/jest-ci-reporter.cjs')],
    }
  : {};

module.exports = {
  displayName: '@eduagent/api',
  rootDir: '../..',
  testEnvironment: 'node',
  ...ciDefaults,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/tsconfig.app.json' }],
  },
  // Swap Neon HTTP driver for standard pg when DATABASE_URL points at
  // localhost (CI container). Unit tests override with their own jest.mock.
  // File lives outside apps/api/ to avoid NX module-boundary lint cascade.
  setupFilesAfterEnv: [join(__dirname, '../../tests/integration/api-setup.ts')],
  passWithNoTests: true,
  moduleNameMapper: {
    '^@eduagent/schemas$': '<rootDir>/packages/schemas/src/index.ts',
    '^@eduagent/retention$': '<rootDir>/packages/retention/src/index.ts',
    '^@eduagent/database$': '<rootDir>/packages/database/src/index.ts',
    '^@eduagent/test-utils$': '<rootDir>/packages/test-utils/src/index.ts',
    '^(\\.{1,2}/.*)\\.[jt]s$': '$1',
  },
  modulePathIgnorePatterns: ['\\.claude/worktrees'],
  moduleFileExtensions: ['ts', 'js'],
  testMatch: [
    '<rootDir>/apps/api/src/**/*.test.ts',
    '<rootDir>/apps/api/eval-llm/**/*.test.ts',
  ],
  // Integration tests share a real Neon database and must run serially.
  // They live in jest.integration.config.cjs → `api:test-integration` target.
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.test\\.ts$',
  ],
  coverageDirectory: '<rootDir>/coverage/apps/api',
};
