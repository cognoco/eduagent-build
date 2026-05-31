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
  testPathIgnorePatterns: ['node_modules', '<rootDir>/.worktrees/'],
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
  // Integration tests share a Neon database. Global-scope operations like
  // quota-reset and concurrent session writes race across parallel workers,
  // so serial execution is required for deterministic runs.
  maxWorkers: 1,
};
