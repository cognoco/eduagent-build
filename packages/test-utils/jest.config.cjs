const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

// When jest is run from inside a git worktree (.worktrees/<branch>/), the
// worktree-guard ignore patterns below would match the worktree's own test
// paths and silently yield "No tests found". Detect that case (the config's
// own __dirname sits under .worktrees/) and drop the .worktrees guards. The
// main-checkout run is unaffected: a worktree's rootDir never contains a
// sibling worktree, so there is no haste-map collision risk to guard against.
const RUNNING_INSIDE_WORKTREE = __dirname.includes('.worktrees');
const dropWorktreeGuards = (patterns) =>
  RUNNING_INSIDE_WORKTREE
    ? patterns.filter((p) => !/worktrees/i.test(p))
    : patterns;

module.exports = {
  displayName: '@eduagent/test-utils',
  rootDir: '../..',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  passWithNoTests: true,
  moduleNameMapper: {
    // Strip .js extensions from relative imports (nodenext source uses .js)
    '^(\\.{1,2}/.*)\\.[jt]s$': '$1',
  },
  // Prevent haste-map from scanning git worktrees at .worktrees/ (monorepo root).
  // '<rootDir>/.worktrees/' is the primary guard; the cross-platform pattern
  // '[/\\]\\.worktrees' also handles paths where <rootDir> expansion uses
  // backslashes on Windows. Both are kept for belt-and-suspenders coverage.
  modulePathIgnorePatterns: dropWorktreeGuards([
    '<rootDir>/.worktrees/',
    '[/\\\\]\\.worktrees',
    '<rootDir>/.tmp/',
    '[/\\\\]\\.tmp',
    '\\.claude/worktrees',
  ]),
  testPathIgnorePatterns: [
    ...dropWorktreeGuards([
      '<rootDir>/.worktrees/',
      '<rootDir>/.tmp/',
      '[/\\\\]\\.tmp',
    ]),
    // WI-536 flaky-test quarantine (see tools/quarantine/).
    ...require('../../tools/quarantine/registry.cjs').jestIgnorePatterns(),
  ],
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/packages/test-utils/src/**/*.test.ts'],
  coverageDirectory: '<rootDir>/coverage/packages/test-utils',
};
