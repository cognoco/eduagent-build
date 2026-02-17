const { join } = require('path');

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'integration',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: join(__dirname, '../../apps/api/tsconfig.app.json') }],
  },
  setupFilesAfterEnv: [join(__dirname, 'setup.ts')],
  moduleNameMapper: {
    '^@eduagent/schemas$': '<rootDir>/../../packages/schemas/src/index.ts',
    '^@eduagent/retention$': '<rootDir>/../../packages/retention/src/index.ts',
    '^@eduagent/database$': '<rootDir>/../../packages/database/src/index.ts',
    '^@eduagent/api$': '<rootDir>/../../apps/api/src/index.ts',
    '^(\\.{1,2}/.*)\\.[jt]s$': '$1',
  },
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['<rootDir>/**/*.integration.test.ts'],
};
