const { join } = require('path');

// Integration tests share a real Neon database. Run serially (maxWorkers: 1)
// to prevent concurrent worker connections from exhausting the Neon WebSocket
// pool and causing FK violations between test suites.
//
// Run via: pnpm exec nx run api:test-integration
// (equivalent to: pnpm exec jest --config apps/api/jest.integration.config.cjs)

module.exports = {
  displayName: '@eduagent/api:integration',
  rootDir: '../..',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/tsconfig.app.json' }],
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
  modulePathIgnorePatterns: ['\\.claude/worktrees'],
  moduleFileExtensions: ['ts', 'js'],
  testMatch: [
    '<rootDir>/apps/api/src/**/*.integration.test.ts',
  ],
  coverageDirectory: '<rootDir>/coverage/apps/api',
  maxWorkers: 1,
};
