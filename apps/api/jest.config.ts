import type { Config } from 'jest';

const config: Config = {
  displayName: '@eduagent/api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.app.json' }],
  },
  passWithNoTests: true,
  moduleNameMapper: {
    '^@eduagent/schemas$': '<rootDir>/../../packages/schemas/src/index.ts',
    '^@eduagent/retention$': '<rootDir>/../../packages/retention/src/index.ts',
    '^@eduagent/database$': '<rootDir>/../../packages/database/src/index.ts',
    '^(\\.{1,2}/.*)\\.[jt]s$': '$1',
  },
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  coverageDirectory: '../../coverage/apps/api',
};

export default config;
