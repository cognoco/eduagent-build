// Exactly replicate what jest does:
// jest-runtime line 429-430:
//   const ignorePatternParts = [...config.modulePathIgnorePatterns, ...]
//   const ignorePattern = new RegExp(ignorePatternParts.join('|'))

// What jest showConfig reports as the effective modulePathIgnorePatterns:
// These are the PROCESSED values (after <rootDir> replacement, etc.)
const effectivePatterns = [
  '\\.claude\\\\worktrees', // from showConfig repr: '\\.claude\\\\worktrees'
  'C:\\\\Dev\\\\Projects\\\\Products\\\\Apps\\\\eduagent-build\\\\.worktrees\\\\', // from showConfig repr
];

console.log('Effective patterns:');
effectivePatterns.forEach((p, i) => {
  console.log(`  [${i}] string value: ${p}`);
  try {
    const r = new RegExp(p);
    console.log(`  [${i}] regex source: ${r.source}`);
  } catch (e) {
    console.log(`  [${i}] INVALID regex: ${e.message}`);
  }
});

const combined = effectivePatterns.join('|');
try {
  const re = new RegExp(combined);
  console.log('\nCombined regex source:', re.source);

  const worktreePath =
    'C:\\Dev\\Projects\\Products\\Apps\\eduagent-build\\.worktrees\\fix-256\\apps\\api\\src\\billing.test.ts';
  const normalPath =
    'C:\\Dev\\Projects\\Products\\Apps\\eduagent-build\\apps\\api\\src\\billing.test.ts';

  console.log('\nWorktree path:', worktreePath);
  console.log('Worktree match:', re.test(worktreePath), '(expected: true)');
  console.log('\nNormal path:', normalPath);
  console.log('Normal match:', re.test(normalPath), '(expected: false)');
} catch (e) {
  console.log('COMBINED REGEX ERROR:', e.message);
}

// Now test the FIXED patterns:
console.log('\n--- Fixed patterns ---');
const fixedPatterns = [
  '[/\\\\]\\.claude[/\\\\]worktrees',
  '[/\\\\]\\.worktrees',
];
console.log('Fixed patterns:');
fixedPatterns.forEach((p, i) => {
  console.log(`  [${i}] string value: ${p}`);
  const r = new RegExp(p);
  console.log(`  [${i}] regex source: ${r.source}`);
});

const fixedCombined = fixedPatterns.join('|');
const fixedRe = new RegExp(fixedCombined);
const worktreePath =
  'C:\\Dev\\Projects\\Products\\Apps\\eduagent-build\\.worktrees\\fix-256\\apps\\api\\src\\billing.test.ts';
const normalPath =
  'C:\\Dev\\Projects\\Products\\Apps\\eduagent-build\\apps\\api\\src\\billing.test.ts';
const claudePath =
  'C:\\Users\\ZuzanaKopecna\\.claude\\worktrees\\fix-256\\foo.ts';

console.log('\nFixed combined regex source:', fixedRe.source);
console.log(
  'Worktree path match:',
  fixedRe.test(worktreePath),
  '(expected: true)',
);
console.log(
  'Normal path match:',
  fixedRe.test(normalPath),
  '(expected: false)',
);
console.log(
  '.claude/worktrees path match:',
  fixedRe.test(claudePath),
  '(expected: true)',
);
