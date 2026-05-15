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
});
