import type { Config } from 'jest';

const nextJestModule = require('next/jest.js');
const nextJest = nextJestModule.default ?? nextJestModule;

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  displayName: '@nx-monorepo/web',
  preset: '../../jest.preset.js',
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.spec.{ts,tsx,js,jsx}',
    '!src/**/*.test.{ts,tsx,js,jsx}',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 10, // Target: 80% (Phase 2+)
      functions: 10, // Target: 80% (Phase 2+)
      lines: 10, // Target: 80% (Phase 2+)
      statements: 10, // Target: 80% (Phase 2+)
    },
  },
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/web',
  testEnvironment: 'jsdom',
  forceExit: false, // Redundant but kept for easy manual toggle
};

module.exports = createJestConfig(config);
