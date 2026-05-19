const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

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
  modulePathIgnorePatterns: [
    '<rootDir>/.worktrees/',
    '[/\\\\]\\.worktrees',
    '\\.claude/worktrees',
  ],
  testPathIgnorePatterns: ['<rootDir>/.worktrees/'],
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['<rootDir>/packages/test-utils/src/**/*.test.ts'],
  coverageDirectory: '<rootDir>/coverage/packages/test-utils',
};
