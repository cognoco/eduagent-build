const path = require('path');

// CI-only readability defaults — silence captured console output from passing
// tests + custom reporter for GitHub Actions annotations and end-of-log
// summary. See docs/superpowers/specs/2026-05-14-ci-failure-readability-design.md.
const ciDefaults = process.env.CI
  ? {
      silent: true,
      reporters: ['default', path.join(__dirname, 'jest-ci-reporter.cjs')],
    }
  : {};

/** @type {import('jest').Config} */
module.exports = {
  transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: false }] },
  testMatch: ['<rootDir>/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  ...ciDefaults,
};
