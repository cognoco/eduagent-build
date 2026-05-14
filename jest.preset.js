const path = require('path');
const nxPreset = require('@nx/jest/preset').default;

// CI-only readability defaults: silence captured console output from passing
// tests and add the custom CI reporter (GitHub Actions annotations + step
// summary + end-of-log failure block). See
// docs/superpowers/specs/2026-05-14-ci-failure-readability-design.md.
const ciDefaults = process.env.CI
  ? {
      silent: true,
      reporters: [
        'default',
        path.join(__dirname, 'scripts/jest-ci-reporter.cjs'),
      ],
    }
  : {};

module.exports = {
  ...nxPreset,
  ...ciDefaults,
};
