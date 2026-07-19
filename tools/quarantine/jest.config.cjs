const path = require('path');

// CI-only readability defaults — silence captured console output from passing
// tests + custom reporter for GitHub Actions annotations and end-of-log
// summary. Mirrors tools/scripts/jest.config.cjs (WI-2120).
const ciDefaults = process.env.CI
  ? {
      silent: true,
      reporters: [
        'default',
        path.join(__dirname, '..', '..', 'scripts', 'jest-ci-reporter.cjs'),
      ],
    }
  : {};

/** @type {import('jest').Config} */
module.exports = {
  transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: false }] },
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // WI-536 flaky-test quarantine (see registry.cjs in this same directory).
  testPathIgnorePatterns: [...require('./registry.cjs').jestIgnorePatterns()],
  ...ciDefaults,
};
