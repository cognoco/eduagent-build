const { join } = require('path');

const rootDir = join(__dirname, '../..').replace(/\\/g, '/');
const fromRoot = (...segments) => [rootDir, ...segments].join('/');

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'integration',
  rootDir,
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: fromRoot('apps/api/tsconfig.app.json') },
    ],
  },
  setupFilesAfterEnv: [fromRoot('tests/integration/setup.ts')],
  moduleNameMapper: {
    '^@eduagent/schemas$': '<rootDir>/packages/schemas/src/index.ts',
    '^@eduagent/retention$': '<rootDir>/packages/retention/src/index.ts',
    '^@eduagent/database$': '<rootDir>/packages/database/src/index.ts',
    '^@eduagent/api$': '<rootDir>/apps/api/src/index.ts',
    '^(\\.{1,2}/.*)\\.[jt]s$': '$1',
  },
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/tests/integration/**/*.integration.test.ts'],
  // The `**/tests/integration/**` glob also matches every copy of this suite
  // inside `.worktrees/<branch>/` checkouts. Without the guards below, a repo
  // with N worktrees runs N+1 copies of every suite against the SAME shared
  // Neon database — cross-suite FK violations everywhere (observed 2026-06-05:
  // 408 suites collected instead of ~51, 252 failed). Anchored to <rootDir> so
  // the config still works when run from inside a worktree (where rootDir IS
  // the worktree and contains no nested .worktrees). Mirrors the guards in
  // apps/api/jest.config.cjs and apps/api/jest.integration.config.cjs.
  modulePathIgnorePatterns: [
    '\\.claude/worktrees',
    '<rootDir>/.worktrees/',
    '<rootDir>/.tmp/',
    '[/\\\\]\\.tmp',
  ],
  testPathIgnorePatterns: [
    'node_modules',
    '<rootDir>/.worktrees/',
    '<rootDir>/.tmp/',
    '[/\\\\]\\.tmp',
    // WI-536 flaky-test quarantine (see tools/quarantine/).
    ...require('../../tools/quarantine/registry.cjs').jestIgnorePatterns(),
  ],
  // Integration tests share a Neon database. Global-scope operations like
  // quota-reset and concurrent session writes race across parallel workers,
  // so serial execution is required for deterministic runs.
  maxWorkers: 1,
};
