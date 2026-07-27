const path = require('path');

// CI-only readability defaults — silence captured console output from passing
// tests + custom reporter for GitHub Actions annotations and end-of-log
// summary.
const ciDefaults = process.env.CI
  ? {
      silent: true,
      reporters: ['default', path.join(__dirname, 'jest-ci-reporter.cjs')],
    }
  : {};

/** @type {import('jest').Config} */
module.exports = {
  transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: false }] },
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // WI-536 flaky-test quarantine (see tools/quarantine/).
  testPathIgnorePatterns: [
    ...require('../tools/quarantine/registry.cjs').jestIgnorePatterns(),
  ],
  ...ciDefaults,
};
