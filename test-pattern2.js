// Verify patterns work correctly
// Run with: node test-pattern2.js

// The string we write in the jest config (as a JS string literal):
// '\\.worktrees' -> when jest does new RegExp('\\.worktrees'), regex = /\.worktrees/
// This matches any path containing .worktrees (the dot being literal)

const p_simple = '\\.worktrees';
const r_simple = new RegExp(p_simple);
console.log('Simple pattern source:', r_simple.source);

const winPath = 'C:\\Dev\\eduagent-build\\.worktrees\\fix-256\\foo.ts';
const unixPath = '/home/user/eduagent-build/.worktrees/fix-256/foo.ts';
const notWorktrees = 'C:\\Dev\\eduagent-build\\apps\\api\\src\\foo.ts';
const worktreesExtra = 'C:\\Dev\\eduagent-build\\.worktrees-extra\\foo.ts';

console.log('Windows worktree match:', r_simple.test(winPath), '(want: true)');
console.log('Unix worktree match:', r_simple.test(unixPath), '(want: true)');
console.log('Normal path match:', r_simple.test(notWorktrees), '(want: false)');
console.log(
  '.worktrees-extra match:',
  r_simple.test(worktreesExtra),
  '(want: false - slight concern)',
);

console.log('');

// Cross-platform version that also avoids the .worktrees-extra false positive
// '[/\\]\\.worktrees' -> as JS string: '[/\\\\]\\.worktrees'
// The \\ in character class becomes \ in regex, matching literal backslash
// The / matches forward slash
const p_cross = '[/\\\\]\\.worktrees';
const r_cross = new RegExp(p_cross);
console.log('Cross-platform pattern source:', r_cross.source);
console.log('Windows worktree match:', r_cross.test(winPath), '(want: true)');
console.log('Unix worktree match:', r_cross.test(unixPath), '(want: true)');
console.log('Normal path match:', r_cross.test(notWorktrees), '(want: false)');
console.log(
  '.worktrees-extra match:',
  r_cross.test(worktreesExtra),
  '(want: false)',
);

console.log('');

// For .claude worktrees
const p_claude = '[/\\\\]\\.claude[/\\\\]worktrees';
const r_claude = new RegExp(p_claude);
console.log('Claude worktrees pattern source:', r_claude.source);
const winClaudePath =
  'C:\\Users\\ZuzanaKopecna\\.claude\\worktrees\\fix-256\\foo.ts';
const unixClaudePath = '/home/user/.claude/worktrees/fix-256/foo.ts';
console.log(
  'Windows .claude/worktrees match:',
  r_claude.test(winClaudePath),
  '(want: true)',
);
console.log(
  'Unix .claude/worktrees match:',
  r_claude.test(unixClaudePath),
  '(want: true)',
);
