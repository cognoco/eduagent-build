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

// True when this preset file itself sits at the root of a worktree checkout —
// i.e. __dirname is exactly `<repo>/.worktrees/<branch>` (the layout
// scripts/setup-worktree.sh produces), so jest was launched from an isolated
// worktree, not the main checkout. Anchoring on the grandparent directory
// name (instead of a substring match anywhere in the path) avoids false
// positives for repos cloned under unrelated `.worktrees` paths; the one
// residual edge — a full clone placed DIRECTLY at `<x>/.worktrees/<y>` — is
// accepted: the only effect is that such a clone's own nested scratch
// copies would be scanned.
const IS_WORKTREE_RUN = path.basename(path.dirname(__dirname)) === '.worktrees';

module.exports = {
  ...nxPreset,
  ...ciDefaults,
  // Prevent haste-map from scanning local scratch copies.
  // The regex entries are cross-platform fallbacks for Windows backslashes.
  // When jest runs INSIDE a .worktrees/<branch>/ checkout (the
  // sanctioned isolated-agent workflow), the unanchored '.worktrees' regex
  // matched EVERY path in the checkout, so every suite reported "No tests
  // found" with exit 0 — a silently-green local gate. Skip the .worktrees
  // patterns for in-worktree runs; CI and main-checkout runs are unchanged.
  modulePathIgnorePatterns: [
    ...(IS_WORKTREE_RUN
      ? []
      : ['<rootDir>/.worktrees/', '[/\\\\]\\.worktrees']),
    '<rootDir>/.tmp/',
    '[/\\\\]\\.tmp',
  ],
  testPathIgnorePatterns: [
    ...(IS_WORKTREE_RUN
      ? []
      : ['<rootDir>/.worktrees/', '[/\\\\]\\.worktrees']),
    '<rootDir>/.tmp/',
    '[/\\\\]\\.tmp',
    // WI-536 flaky-test quarantine: skip registered flaky files from the gate
    // (returns [] under QUARANTINE_MODE=report so the report lane runs them).
    ...require('./tools/quarantine/registry.cjs').jestIgnorePatterns(),
  ],
};
