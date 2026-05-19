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
  // Prevent haste-map from scanning git worktrees at .worktrees/.
  // '<rootDir>/.worktrees/' is the primary guard for configs where rootDir is
  // the monorepo root. '[/\\]\\.worktrees' is a cross-platform fallback that
  // matches both forward and backslashes (Windows path separator), covering the
  // case where <rootDir> expands with backslashes and the forward-slash literal
  // in '<rootDir>/.worktrees/' would fail to match on Windows.
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/', '[/\\\\]\\.worktrees'],
  testPathIgnorePatterns: ['<rootDir>/.worktrees/', '[/\\\\]\\.worktrees'],
};
