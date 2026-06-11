const path = require('path');
const nxPreset = require('@nx/jest/preset').default;

// When jest is run from inside a git worktree (.worktrees/<branch>/), the
// worktree-guard ignore patterns below would match the worktree's own test
// paths and silently yield "No tests found". Detect that case and drop the
// .worktrees guards — mirrors the same guard in apps/api/jest.config.cjs.
// Detection is anchored on the grandparent directory name (__dirname is
// exactly `<repo>/.worktrees/<branch>` in the layout scripts/setup-worktree.sh
// produces) rather than a substring match anywhere in the path, so repos
// cloned under unrelated `.worktrees` paths are not false positives; the one
// residual edge — a full clone placed DIRECTLY at `<x>/.worktrees/<y>` — is
// accepted (its own nested scratch copies would be scanned). The
// main-checkout run is unaffected: a worktree's rootDir never contains a
// sibling worktree, so there is no haste-map collision risk to guard against.
const RUNNING_INSIDE_WORKTREE =
  path.basename(path.dirname(__dirname)) === '.worktrees';
const dropWorktreeGuards = (patterns) =>
  RUNNING_INSIDE_WORKTREE
    ? patterns.filter((p) => !/worktrees/i.test(p))
    : patterns;

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
  // Prevent haste-map from scanning local scratch copies.
  // The regex entries are cross-platform fallbacks for Windows backslashes.
  modulePathIgnorePatterns: dropWorktreeGuards([
    '<rootDir>/.worktrees/',
    '[/\\\\]\\.worktrees',
    '<rootDir>/.tmp/',
    '[/\\\\]\\.tmp',
  ]),
  testPathIgnorePatterns: [
    ...dropWorktreeGuards([
      '<rootDir>/.worktrees/',
      '[/\\\\]\\.worktrees',
      '<rootDir>/.tmp/',
      '[/\\\\]\\.tmp',
    ]),
    // WI-536 flaky-test quarantine: skip registered flaky files from the gate
    // (returns [] under QUARANTINE_MODE=report so the report lane runs them).
    ...require('./tools/quarantine/registry.cjs').jestIgnorePatterns(),
  ],
};
