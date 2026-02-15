import type { Config } from 'jest';

const config: Config = {
  displayName: '@eduagent/api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.app.json' }],
  },
  passWithNoTests: true,
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  coverageDirectory: '../../coverage/apps/api',
};

export default config;
