// Break-test for BUG-1051: structural Pattern A enforcement.
// Red without the new logic (gc1-allow sticker bypass), green with it.

import {
  checkFile,
  extractSpecifier,
  findAddedMockLines,
  isPatternA,
} from './check-gc1-pattern-a';

describe('extractSpecifier', () => {
  it('extracts a relative specifier from jest.mock(...)', () => {
    expect(extractSpecifier("jest.mock('./services/foo', () => ({}));")).toBe(
      './services/foo',
    );
  });
  it('extracts a relative specifier from jest.doMock(...)', () => {
    expect(extractSpecifier("jest.doMock('../middleware/jwt');")).toBe(
      '../middleware/jwt',
    );
  });
  it('returns null for bare specifiers', () => {
    expect(extractSpecifier("jest.mock('stripe');")).toBeNull();
  });
});

describe('isPatternA', () => {
  it('accepts inline spread of jest.requireActual', () => {
    const lines = [
      "jest.mock('./services/foo', () => ({",
      "  ...jest.requireActual('./services/foo'),",
      '  bar: jest.fn(),',
      '}));',
    ];
    expect(isPatternA(lines, 1, './services/foo')).toBe(true);
  });

  it('accepts inline spread with type-generic jest.requireActual', () => {
    const lines = [
      "jest.mock('./services/foo', () => ({",
      "  ...jest.requireActual<typeof import('./services/foo')>('./services/foo'),",
      '  bar: jest.fn(),',
      '}));',
    ];
    expect(isPatternA(lines, 1, './services/foo')).toBe(true);
  });

  it('accepts named-local spread', () => {
    const lines = [
      "jest.mock('../services/dashboard', () => {",
      "  const actual = jest.requireActual('../services/dashboard');",
      '  return {',
      '    ...actual,',
      '    foo: jest.fn(),',
      '  };',
      '});',
    ];
    expect(isPatternA(lines, 1, '../services/dashboard')).toBe(true);
  });

  it('accepts named-local spread with type-generic jest.requireActual', () => {
    const lines = [
      "jest.mock('../services/dashboard', () => {",
      "  const actual = jest.requireActual<typeof import('../services/dashboard')>('../services/dashboard');",
      '  return {',
      '    ...actual,',
      '    foo: jest.fn(),',
      '  };',
      '});',
    ];
    expect(isPatternA(lines, 1, '../services/dashboard')).toBe(true);
  });

  it('accepts named-local spread with multiline type-generic jest.requireActual', () => {
    const lines = [
      "jest.mock('../services/llm', () => {",
      '  const actual = jest.requireActual<',
      "    typeof import('../services/llm')",
      '  >(',
      "    '../services/llm',",
      '  );',
      '  return { ...actual, routeAndCall: jest.fn() };',
      '});',
    ];
    expect(isPatternA(lines, 1, '../services/llm')).toBe(true);
  });

  it('accepts named-local spread with type annotation', () => {
    const lines = [
      "jest.mock('../services/llm', () => {",
      '  const actual = jest.requireActual(',
      "    '../services/llm',",
      "  ) as typeof import('../services/llm');",
      '  return { ...actual, routeAndCall: jest.fn() };',
      '});',
    ];
    expect(isPatternA(lines, 1, '../services/llm')).toBe(true);
  });

  it('rejects a factory with no jest.requireActual', () => {
    const lines = [
      "jest.mock('./services/foo', () => ({",
      '  bar: jest.fn(),',
      '  baz: jest.fn(),',
      '}));',
    ];
    expect(isPatternA(lines, 1, './services/foo')).toBe(false);
  });

  it('rejects requireActual without a spread (named local never spread)', () => {
    const lines = [
      "jest.mock('./services/foo', () => {",
      "  const real = jest.requireActual('./services/foo');",
      '  return { bar: real.bar };',
      '});',
    ];
    expect(isPatternA(lines, 1, './services/foo')).toBe(false);
  });

  it('rejects type-generic requireActual of a different specifier', () => {
    const lines = [
      "jest.mock('./services/foo', () => ({",
      "  ...jest.requireActual<typeof import('./services/bar')>('./services/bar'),",
      '  baz: jest.fn(),',
      '}));',
    ];
    expect(isPatternA(lines, 1, './services/foo')).toBe(false);
  });

  it('rejects type-generic requireActual of a different specifier even with a later matching greater-than expression', () => {
    const lines = [
      "jest.mock('./services/foo', () => ({",
      "  ...jest.requireActual<typeof import('./services/bar')>('./services/bar'),",
      "  marker: value > ('./services/foo'),",
      '}));',
    ];
    expect(isPatternA(lines, 1, './services/foo')).toBe(false);
  });

  it('rejects requireActual of a different specifier (shadow trick)', () => {
    const lines = [
      "jest.mock('./services/foo', () => ({",
      "  ...jest.requireActual('./services/bar'),",
      '  baz: jest.fn(),',
      '}));',
    ];
    expect(isPatternA(lines, 1, './services/foo')).toBe(false);
  });
});

describe('findAddedMockLines', () => {
  it('parses unified=0 diff and reports new-file line numbers', () => {
    const diff = [
      'diff --git a/foo.test.ts b/foo.test.ts',
      'index 1234..5678 100644',
      '--- a/foo.test.ts',
      '+++ b/foo.test.ts',
      '@@ -0,0 +12,3 @@',
      "+jest.mock('./services/foo', () => ({",
      "+  ...jest.requireActual('./services/foo'),",
      '+}));',
    ].join('\n');
    const sites = findAddedMockLines(diff);
    expect(sites).toHaveLength(1);
    expect(sites[0].line).toBe(12);
    expect(sites[0].content).toContain("jest.mock('./services/foo'");
  });

  it('ignores bare-specifier mocks', () => {
    const diff = ['@@ -0,0 +5,1 @@', "+jest.mock('stripe');"].join('\n');
    expect(findAddedMockLines(diff)).toEqual([]);
  });

  // Regression for F-156: multiline jest.mock calls where the specifier sits
  // on a separate physical line from jest.mock( must be detected.
  it('detects a multiline internal mock (specifier on next added line)', () => {
    const diff = [
      '@@ -0,0 +1,4 @@',
      '+jest.mock(',
      "+  './services/foo',",
      '+  () => ({ bar: jest.fn() })',
      '+);',
    ].join('\n');
    const sites = findAddedMockLines(diff);
    expect(sites).toHaveLength(1);
    expect(sites[0].line).toBe(1);
    expect(sites[0].content).toContain("'./services/foo'");
  });

  it('ignores a multiline mock whose specifier is a bare external package', () => {
    const diff = [
      '@@ -0,0 +1,4 @@',
      '+jest.mock(',
      "+  'stripe',",
      '+  () => ({})',
      '+);',
    ].join('\n');
    expect(findAddedMockLines(diff)).toEqual([]);
  });

  // Codex/CodeRabbit review: a comment or blank line between jest.mock( and the
  // specifier must NOT defeat detection (it is valid JS trivia). The real-world
  // shape is a multi-line gc1-allow rationale block — see
  // tests/integration/stripe-webhook.integration.test.ts.
  it('detects a multiline internal mock with comment+blank lines before the specifier', () => {
    const diff = [
      '@@ -0,0 +1,6 @@',
      '+jest.mock(',
      '+  // a rationale comment',
      '+',
      "+  './services/foo',",
      '+  () => ({ bar: jest.fn() })',
      '+);',
    ].join('\n');
    const sites = findAddedMockLines(diff);
    expect(sites).toHaveLength(1);
    expect(sites[0].line).toBe(1);
    expect(sites[0].content).toContain("'./services/foo'");
  });

  it('stops at a non-specifier code line (variable specifier is not flagged)', () => {
    const diff = [
      '@@ -0,0 +1,3 @@',
      '+jest.mock(',
      '+  modulePath,',
      '+  () => ({})',
      '+);',
    ].join('\n');
    expect(findAddedMockLines(diff)).toEqual([]);
  });
});

describe('checkFile — integration', () => {
  // The pre-fix hook accepted any sticker-stamped gc1-allow regardless of
  // whether the factory was Pattern A. This is the BUG-1051 attack scenario:
  // it must still pass (gc1-allow is an explicit escape hatch), but a NEW
  // mock without Pattern A AND without gc1-allow must fail.
  it('allows a gc1-allow sticker (escape hatch)', () => {
    const diff = [
      '@@ -0,0 +1,1 @@',
      "+jest.mock('./services/foo', () => ({})); // gc1-allow: external boundary wrapper",
    ].join('\n');
    const staged =
      "jest.mock('./services/foo', () => ({})); // gc1-allow: external boundary wrapper\n";
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });

  it('allows a Pattern A mock with no gc1-allow', () => {
    const diff = [
      '@@ -0,0 +1,4 @@',
      "+jest.mock('./services/foo', () => ({",
      "+  ...jest.requireActual('./services/foo'),",
      '+  bar: jest.fn(),',
      '+}));',
    ].join('\n');
    const staged = [
      "jest.mock('./services/foo', () => ({",
      "  ...jest.requireActual('./services/foo'),",
      '  bar: jest.fn(),',
      '}));',
    ].join('\n');
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });

  it('allows a type-generic Pattern A mock with no gc1-allow', () => {
    const diff = [
      '@@ -0,0 +1,4 @@',
      "+jest.mock('./services/foo', () => ({",
      "+  ...jest.requireActual<typeof import('./services/foo')>('./services/foo'),",
      '+  bar: jest.fn(),',
      '+}));',
    ].join('\n');
    const staged = [
      "jest.mock('./services/foo', () => ({",
      "  ...jest.requireActual<typeof import('./services/foo')>('./services/foo'),",
      '  bar: jest.fn(),',
      '}));',
    ].join('\n');
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });

  it('allows a named-local type-generic Pattern A mock with no gc1-allow', () => {
    const diff = [
      '@@ -0,0 +1,7 @@',
      "+jest.mock('../services/dashboard', () => {",
      "+  const actual = jest.requireActual<typeof import('../services/dashboard')>('../services/dashboard');",
      '+  return {',
      '+    ...actual,',
      '+    foo: jest.fn(),',
      '+  };',
      '+});',
    ].join('\n');
    const staged = [
      "jest.mock('../services/dashboard', () => {",
      "  const actual = jest.requireActual<typeof import('../services/dashboard')>('../services/dashboard');",
      '  return {',
      '    ...actual,',
      '    foo: jest.fn(),',
      '  };',
      '});',
    ].join('\n');
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });

  it('allows a multiline type-generic Pattern A mock with no gc1-allow', () => {
    const diff = [
      '@@ -0,0 +1,8 @@',
      "+jest.mock('../services/llm', () => {",
      '+  const actual = jest.requireActual<',
      "+    typeof import('../services/llm')",
      '+  >(',
      "+    '../services/llm',",
      '+  );',
      '+  return { ...actual, routeAndCall: jest.fn() };',
      '+});',
    ].join('\n');
    const staged = [
      "jest.mock('../services/llm', () => {",
      '  const actual = jest.requireActual<',
      "    typeof import('../services/llm')",
      '  >(',
      "    '../services/llm',",
      '  );',
      '  return { ...actual, routeAndCall: jest.fn() };',
      '});',
    ].join('\n');
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });

  // RED test: the previous textual-only hook accepted this because the line
  // had no `gc1-allow`, but… wait — this exact case the old hook would have
  // BLOCKED (no sticker). The bug is the converse: the old hook accepted
  // anything sticker-stamped regardless of Pattern A. Documented next.
  it('blocks a NEW non-Pattern-A mock with no sticker', () => {
    const diff = [
      '@@ -0,0 +1,3 @@',
      "+jest.mock('./services/foo', () => ({",
      '+  bar: jest.fn(),',
      '+}));',
    ].join('\n');
    const staged = [
      "jest.mock('./services/foo', () => ({",
      '  bar: jest.fn(),',
      '}));',
    ].join('\n');
    const v = checkFile('a.test.ts', diff, staged);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toBe('missing-pattern-a');
  });

  // Regression for F-156: multiline mock with no gc1-allow and no Pattern A
  // must be blocked even though jest.mock( and the specifier are on separate lines.
  it('blocks a NEW multiline non-Pattern-A internal mock', () => {
    const diff = [
      '@@ -0,0 +1,4 @@',
      '+jest.mock(',
      "+  './services/foo',",
      '+  () => ({ bar: jest.fn() })',
      '+);',
    ].join('\n');
    const staged = [
      'jest.mock(',
      "  './services/foo',",
      '  () => ({ bar: jest.fn() })',
      ');',
    ].join('\n');
    const v = checkFile('a.test.ts', diff, staged);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toBe('missing-pattern-a');
  });

  it('blocks a NEW multiline typed non-Pattern-A internal mock', () => {
    const diff = [
      '@@ -0,0 +1,6 @@',
      '+jest.mock<typeof import(',
      "+  './services/foo'",
      '+)>(',
      "+  './services/foo',",
      '+  () => ({ bar: jest.fn() })',
      '+);',
    ].join('\n');
    const staged = [
      'jest.mock<typeof import(',
      "  './services/foo'",
      ')>(',
      "  './services/foo',",
      '  () => ({ bar: jest.fn() })',
      ');',
    ].join('\n');
    const v = checkFile('a.test.ts', diff, staged);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toBe('missing-pattern-a');
  });

  it('allows a multiline internal mock with gc1-allow on the jest.mock( line', () => {
    const diff = [
      '@@ -0,0 +1,4 @@',
      '+jest.mock( // gc1-allow: unit-test boundary',
      "+  './services/foo',",
      '+  () => ({})',
      '+);',
    ].join('\n');
    const staged = [
      'jest.mock( // gc1-allow: unit-test boundary',
      "  './services/foo',",
      '  () => ({})',
      ');',
    ].join('\n');
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });

  it('allows a multiline internal mock that is Pattern A', () => {
    const diff = [
      '@@ -0,0 +1,6 @@',
      '+jest.mock(',
      "+  './services/foo',",
      '+  () => ({',
      "+    ...jest.requireActual('./services/foo'),",
      '+    bar: jest.fn(),',
      '+  })',
      '+);',
    ].join('\n');
    const staged = [
      'jest.mock(',
      "  './services/foo',",
      '  () => ({',
      "    ...jest.requireActual('./services/foo'),",
      '    bar: jest.fn(),',
      '  })',
      ');',
    ].join('\n');
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });

  // Real-world shape (stripe-webhook.integration.test.ts): a multi-line
  // gc1-allow rationale block sits between jest.mock( and the specifier.
  // The escape hatch must be honored even though it spans several comment lines.
  it('allows a multiline internal mock with gc1-allow in a comment block before the specifier', () => {
    const diff = [
      '@@ -0,0 +1,6 @@',
      '+jest.mock(',
      '+  // gc1-allow: external boundary needs real crypto unavailable in tests;',
      '+  // we requireActual the wrapper and stub only the signature check.',
      "+  './services/stripe',",
      '+  () => ({})',
      '+);',
    ].join('\n');
    const staged = [
      'jest.mock(',
      '  // gc1-allow: external boundary needs real crypto unavailable in tests;',
      '  // we requireActual the wrapper and stub only the signature check.',
      "  './services/stripe',",
      '  () => ({})',
      ');',
    ].join('\n');
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });

  // WI-1355 variant (a): gc1-allow trails the specifier on the SAME line,
  // inside a genuinely multi-line jest.mock( call. Found diagnosing PR 1842
  // (3 false violations) — the captured `content` slice ended at the
  // specifier literal's own end, so a comment after it on that line fell
  // outside the slice GC1_ALLOW.test() inspects.
  it('allows a multiline internal mock with gc1-allow trailing the specifier on the same line', () => {
    const diff = [
      '@@ -0,0 +1,4 @@',
      '+jest.mock(',
      "+  './services/foo', // gc1-allow: unit-test boundary",
      '+  () => ({ bar: jest.fn() })',
      '+);',
    ].join('\n');
    const staged = [
      'jest.mock(',
      "  './services/foo', // gc1-allow: unit-test boundary",
      '  () => ({ bar: jest.fn() })',
      ');',
    ].join('\n');
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });

  // WI-1355 variant (b): gc1-allow sits on its OWN line, immediately after
  // the specifier line, before the factory function begins.
  it('allows a multiline internal mock with gc1-allow on its own line immediately after the specifier', () => {
    const diff = [
      '@@ -0,0 +1,5 @@',
      '+jest.mock(',
      "+  './services/foo',",
      '+  // gc1-allow: unit-test boundary',
      '+  () => ({ bar: jest.fn() })',
      '+);',
    ].join('\n');
    const staged = [
      'jest.mock(',
      "  './services/foo',",
      '  // gc1-allow: unit-test boundary',
      '  () => ({ bar: jest.fn() })',
      ');',
    ].join('\n');
    expect(checkFile('a.test.ts', diff, staged)).toEqual([]);
  });
});
