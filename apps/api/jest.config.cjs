const { join } = require('path');

// When jest is run from inside a git worktree (.worktrees/<branch>/), the
// worktree-guard ignore patterns below would match the worktree's own test
// paths and silently yield "No tests found". Detect that case (the config's
// own __dirname sits under .worktrees/) and drop the .worktrees guards. The
// main-checkout run is unaffected: a worktree's rootDir never contains a
// sibling worktree, so there is no haste-map collision risk to guard against.
const RUNNING_INSIDE_WORKTREE = __dirname.includes('.worktrees');
const dropWorktreeGuards = (patterns) =>
  RUNNING_INSIDE_WORKTREE
    ? patterns.filter((p) => !/worktrees/i.test(p))
    : patterns;

// CI-only readability defaults — silence captured console output from passing
// tests + custom reporter for GitHub Actions annotations and end-of-log
// summary.
const ciDefaults = process.env.CI
  ? {
      silent: true,
      reporters: [
        'default',
        join(__dirname, '../../scripts/jest-ci-reporter.cjs'),
      ],
    }
  : {};

module.exports = {
  displayName: '@eduagent/api',
  rootDir: '../..',
  testEnvironment: join(__dirname, '../../tests/unit/api-test-environment.cjs'),
  ...ciDefaults,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/apps/api/tsconfig.app.json' },
    ],
  },
  // Swap Neon HTTP driver for standard pg when DATABASE_URL points at
  // localhost (CI container). Unit tests override with their own jest.mock.
  // File lives outside apps/api/ to avoid NX module-boundary lint cascade.
  setupFilesAfterEnv: [
    join(__dirname, '../../tests/integration/api-setup.ts'),
    join(__dirname, '../../tests/unit/api-env-setup.ts'),
  ],
  passWithNoTests: true,
  moduleNameMapper: {
    '^@eduagent/schemas$': '<rootDir>/packages/schemas/src/index.ts',
    '^@eduagent/retention$': '<rootDir>/packages/retention/src/index.ts',
    '^@eduagent/database$': '<rootDir>/packages/database/src/index.ts',
    '^@eduagent/test-utils$': '<rootDir>/packages/test-utils/src/index.ts',
    '^(\\.{1,2}/.*)\\.[jt]s$': '$1',
  },
  modulePathIgnorePatterns: dropWorktreeGuards([
    '\\.claude/worktrees',
    '<rootDir>/.worktrees/',
    '<rootDir>/.tmp/',
    '[/\\\\]\\.tmp',
  ]),
  moduleFileExtensions: ['ts', 'js'],
  testMatch: [
    '**/apps/api/src/**/*.test.ts',
    '**/apps/api/eval-llm/**/*.test.ts',
  ],
  // Integration tests share a real Neon database and must run serially.
  // They live in jest.integration.config.cjs → `api:integration-api` target.
  testPathIgnorePatterns: [
    ...dropWorktreeGuards([
      '/node_modules/',
      '<rootDir>/.worktrees/',
      '<rootDir>/.tmp/',
      '[/\\\\]\\.tmp',
      '\\.integration\\.test\\.ts$',
    ]),
    // WI-536 flaky-test quarantine (see tools/quarantine/).
    ...require('../../tools/quarantine/registry.cjs').jestIgnorePatterns(),
  ],
  coverageDirectory: '<rootDir>/coverage/apps/api',
};
