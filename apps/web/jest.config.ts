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

// CommonJS export required: Jest + Next.js 16 have ESM interop issues.
// Using `export default` causes "TypeError: nextJest is not a function".
// See: docs/memories/tech-findings-log/module-24-nx-22-upgrade-breaking-changes-2025-12-12.md
module.exports = createJestConfig(config);
