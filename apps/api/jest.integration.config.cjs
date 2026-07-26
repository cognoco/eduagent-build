const { join } = require('path');

// Integration tests share a real Neon database. Run serially (maxWorkers: 1)
// to prevent concurrent worker connections from exhausting the Neon WebSocket
// pool and causing FK violations between test suites.
//
// Run via: pnpm exec nx run api:integration-api
// (equivalent to: pnpm exec jest --config apps/api/jest.integration.config.cjs)

module.exports = {
  displayName: '@eduagent/api:integration',
  rootDir: '../..',
  testEnvironment: join(__dirname, '../../tests/unit/api-test-environment.cjs'),
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/apps/api/tsconfig.app.json' },
    ],
  },
  setupFilesAfterEnv: [join(__dirname, '../../tests/integration/api-setup.ts')],
  passWithNoTests: true,
  moduleNameMapper: {
    '^@eduagent/schemas$': '<rootDir>/packages/schemas/src/index.ts',
    '^@eduagent/retention$': '<rootDir>/packages/retention/src/index.ts',
    '^@eduagent/database$': '<rootDir>/packages/database/src/index.ts',
    '^@eduagent/test-utils$': '<rootDir>/packages/test-utils/src/index.ts',
    '^(\\.{1,2}/.*)\\.[jt]s$': '$1',
  },
  modulePathIgnorePatterns: [
    '\\.claude/worktrees',
    '<rootDir>/.worktrees/',
    '<rootDir>/.tmp/',
    '[/\\\\]\\.tmp',
  ],
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/apps/api/src/**/*.integration.test.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/.worktrees/',
    '<rootDir>/.tmp/',
    '[/\\\\]\\.tmp',
    // WI-536 flaky-test quarantine (see tools/quarantine/).
    ...require('../../tools/quarantine/registry.cjs').jestIgnorePatterns(),
  ],
  coverageDirectory: '<rootDir>/coverage/apps/api',
  maxWorkers: 1,
};
