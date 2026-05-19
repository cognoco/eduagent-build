// Test script to verify jest modulePathIgnorePatterns works on Windows for .worktrees/
// Run with: node test-pattern.js
const path = require('path');

const rootDir = 'C:\\Dev\\Projects\\Products\\Apps\\eduagent-build';
const worktreePath =
  rootDir + '\\.worktrees\\fix-256\\apps\\api\\src\\billing.test.ts';
const nonWorktreePath = rootDir + '\\apps\\api\\src\\billing.test.ts';

console.log('rootDir:', rootDir);
console.log('worktreePath:', worktreePath);
console.log('nonWorktreePath:', nonWorktreePath);
console.log('');

// Current pattern in jest.preset.js: '<rootDir>/.worktrees/'
// After <rootDir> replacement: 'C:\\Dev\\Projects\\Products\\Apps\\eduagent-build/.worktrees/'
// This regex uses forward slash but Windows paths use backslash -> NO MATCH
const currentPatternExpanded = rootDir + '/.worktrees/';
const currentRe = new RegExp(currentPatternExpanded);
console.log('Current pattern source:', currentRe.source);
console.log(
  'Current pattern worktree match:',
  currentRe.test(worktreePath),
  '(EXPECTED: true)',
);
console.log(
  'Current pattern non-worktree match:',
  currentRe.test(nonWorktreePath),
  '(EXPECTED: false)',
);
console.log('');

// Cross-platform fix: match either slash
// In a jest config JS file, the string '[/\\]\\.worktrees[/\\]' needs to be written as:
// '[/\\\\]\\.worktrees[/\\\\]' (four backslashes in JS source -> two in string -> one in regex char class)
// But the jest config string value itself is what we need to put in modulePathIgnorePatterns
// When jest does new RegExp(pattern), the pattern string is used directly

// The string we want in modulePathIgnorePatterns:
const fixedPattern = '[/\\\\]\\.worktrees[/\\\\]';
const fixedRe = new RegExp(fixedPattern);
console.log('Fixed pattern source:', fixedRe.source);
console.log(
  'Fixed pattern worktree match:',
  fixedRe.test(worktreePath),
  '(EXPECTED: true)',
);
console.log(
  'Fixed pattern non-worktree match:',
  fixedRe.test(nonWorktreePath),
  '(EXPECTED: false)',
);
console.log('');

// Simpler alternative: just match the directory name pattern
const simplePattern = '\\.worktrees';
const simpleRe = new RegExp(simplePattern);
console.log('Simple pattern source:', simpleRe.source);
console.log(
  'Simple pattern worktree match:',
  simpleRe.test(worktreePath),
  '(EXPECTED: true)',
);
console.log(
  'Simple pattern non-worktree match:',
  simpleRe.test(nonWorktreePath),
  '(EXPECTED: false)',
);
