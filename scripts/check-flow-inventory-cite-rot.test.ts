import {
  classifyToken,
  extractBacktickTokens,
  resolveCitation,
  extractDefinedRowIds,
  extractRemovedRowIds,
  checkRowIdCrossLinks,
  checkFlagTokens,
  checkLegacyTags,
  type FileIndex,
} from './check-flow-inventory-cite-rot';

describe('classifyToken', () => {
  it('parses a code citation with a single line number', () => {
    expect(classifyToken('feature-flags.ts:32')).toEqual({
      raw: 'feature-flags.ts:32',
      filePath: 'feature-flags.ts',
      isGlob: false,
      startLine: 32,
      endLine: 32,
    });
  });

  it('parses a citation with several comma-separated spots in one file, checking the max', () => {
    expect(classifyToken('app-context.tsx:67,77')).toEqual({
      raw: 'app-context.tsx:67,77',
      filePath: 'app-context.tsx',
      isGlob: false,
      startLine: 67,
      endLine: 77,
    });
    expect(classifyToken('_layout.tsx:793-798,828-861')).toEqual({
      raw: '_layout.tsx:793-798,828-861',
      filePath: '_layout.tsx',
      isGlob: false,
      startLine: 793,
      endLine: 861,
    });
  });

  it('parses a code citation with a line range', () => {
    expect(classifyToken('navigation-contract.ts:457-527')).toEqual({
      raw: 'navigation-contract.ts:457-527',
      filePath: 'navigation-contract.ts',
      isGlob: false,
      startLine: 457,
      endLine: 527,
    });
  });

  it('parses a manifest citation with no line number', () => {
    expect(classifyToken('auth/sign-in-navigation.yaml')).toEqual({
      raw: 'auth/sign-in-navigation.yaml',
      filePath: 'auth/sign-in-navigation.yaml',
      isGlob: false,
      startLine: undefined,
      endLine: undefined,
    });
  });

  it('marks a glob-style citation', () => {
    expect(classifyToken('retention/topic-detail*.yaml')?.isGlob).toBe(true);
  });

  it('skips suffix-shorthand continuations', () => {
    expect(classifyToken('-phone.yaml')).toBeNull();
  });

  it('skips tokens with no resolvable extension', () => {
    expect(classifyToken('MODE_NAV_V2_ENABLED')).toBeNull();
    expect(classifyToken('/consent')).toBeNull();
  });

  it('skips prose that slipped into backticks', () => {
    expect(
      classifyToken('labels the choose-book path as browse all…'),
    ).toBeNull();
  });
});

describe('extractBacktickTokens', () => {
  it('extracts every backtick span in document order, deduplicated', () => {
    const body = [
      '| ID | `feature-flags.ts:32` | `auth/foo.yaml` |',
      '| ID2 | `feature-flags.ts:32` | `bar.yaml` |',
    ].join('\n');
    expect(extractBacktickTokens(body)).toEqual([
      'feature-flags.ts:32',
      'auth/foo.yaml',
      'bar.yaml',
    ]);
  });

  it('does not span across newlines', () => {
    const body = '`unterminated\nbar.yaml`';
    expect(extractBacktickTokens(body)).toEqual([]);
  });
});

describe('resolveCitation', () => {
  const index: FileIndex = {
    byBasename: new Map([
      [
        'navigation-contract.ts',
        ['apps/mobile/src/lib/navigation-contract.ts'],
      ],
      ['foo.yaml', ['apps/mobile/e2e/flows/auth/foo.yaml']],
      [
        'topic-detail-a.yaml',
        ['apps/mobile/e2e/flows/retention/topic-detail-a.yaml'],
      ],
      [
        'topic-detail-b.yaml',
        ['apps/mobile/e2e/flows/retention/topic-detail-b.yaml'],
      ],
    ]),
  };
  const lineCounts: Record<string, number> = {
    'apps/mobile/src/lib/navigation-contract.ts': 643,
  };
  const getLineCount = (relPath: string): number => lineCounts[relPath] ?? 0;

  it('passes an existence-only citation whose file exists', () => {
    expect(
      resolveCitation(classifyToken('foo.yaml')!, index, getLineCount),
    ).toBeNull();
  });

  it('fails an existence-only citation whose file is missing', () => {
    const result = resolveCitation(
      classifyToken('missing.yaml')!,
      index,
      getLineCount,
    );
    expect(result?.reason).toContain('no file named "missing.yaml"');
  });

  it('passes a line-numbered citation within range', () => {
    expect(
      resolveCitation(
        classifyToken('navigation-contract.ts:457-527')!,
        index,
        getLineCount,
      ),
    ).toBeNull();
  });

  it('fails a line-numbered citation past EOF', () => {
    const result = resolveCitation(
      classifyToken('navigation-contract.ts:900')!,
      index,
      getLineCount,
    );
    expect(result?.reason).toContain('900+ lines');
  });

  it('passes a glob citation matching at least one real basename', () => {
    expect(
      resolveCitation(
        classifyToken('retention/topic-detail*.yaml')!,
        index,
        getLineCount,
      ),
    ).toBeNull();
  });

  it('fails a glob citation matching nothing', () => {
    const result = resolveCitation(
      classifyToken('retention/no-such-*.yaml')!,
      index,
      getLineCount,
    );
    expect(result?.reason).toContain('no file matches glob pattern');
  });
});

describe('extractDefinedRowIds', () => {
  it('collects every ID at the start of a table row, ignoring prose mentions', () => {
    const body = [
      '| HOME-03 | Tab shapes | see matrix | per matrix | none | `foo.yaml` |',
      '| V2-SCOPE-01 | Scope switching | chrome | sup only | none | `bar.spec.ts` |',
      'Some prose mentioning HOME-03 again does not add a new ID.',
    ].join('\n');
    expect(extractDefinedRowIds(body)).toEqual(
      new Set(['HOME-03', 'V2-SCOPE-01']),
    );
  });
});

describe('extractRemovedRowIds', () => {
  it('collects bolded IDs from the Removed section only', () => {
    const body = [
      '| SUBJECT-08 | ... (see Removed: SUBJECT-16) | ... |',
      '## Removed in this refresh',
      '',
      '- **SUBJECT-16** — no such flow exists',
      '- **PARENT-07** — no such flow exists',
      '',
      '## Current Gaps and Next Candidates',
      '',
      '- **SUBJECT-08** should not be collected here',
    ].join('\n');
    expect(extractRemovedRowIds(body)).toEqual(
      new Set(['SUBJECT-16', 'PARENT-07']),
    );
  });
});

describe('checkRowIdCrossLinks', () => {
  it('passes a reference to a row that is actually defined', () => {
    const body = [
      '| HOME-03 | Tab shapes | ... | ... | ... | `foo.yaml` |',
      '| V2-SCOPE-01 | Scope switching (see also HOME-03) | ... | ... | ... | `bar.spec.ts` |',
    ].join('\n');
    expect(checkRowIdCrossLinks(body)).toEqual([]);
  });

  it('passes a reference to an explicitly-removed ID', () => {
    const body = [
      '| SUBJECT-08 | ... (see Removed: SUBJECT-16) | ... | ... | ... | `x.yaml` |',
      '## Removed in this refresh',
      '- **SUBJECT-16** — no such flow exists',
      '## Current Gaps and Next Candidates',
    ].join('\n');
    expect(checkRowIdCrossLinks(body)).toEqual([]);
  });

  it('flags a bare V2-NN reference — the exact WI-2198 review bug', () => {
    const body = [
      '| V2-SCOPE-01 | Scope switching | ... | ... | ... | `x.spec.ts` |',
      'Coverage class for every row below: code-only beyond the scope-switching journey (V2-05).',
    ].join('\n');
    const failures = checkRowIdCrossLinks(body);
    expect(failures).toHaveLength(1);
    expect(failures[0].token).toBe('V2-05');
  });

  it('flags a reference whose family is real but whose specific ID is not defined or removed', () => {
    const body = [
      '| HOME-03 | Tab shapes | ... | ... | ... | `foo.yaml` |',
      'Some row wrongly points at HOME-99, which does not exist.',
    ].join('\n');
    const failures = checkRowIdCrossLinks(body);
    expect(failures).toHaveLength(1);
    expect(failures[0].token).toBe('HOME-99');
  });

  it('ignores tokens whose family is not a real row-ID family (bug trackers, WI IDs)', () => {
    const body = [
      '| HOME-03 | Tab shapes fixed per BUG-238, tracked as WI-2198 | ... | ... | ... | `foo.yaml` |',
    ].join('\n');
    expect(checkRowIdCrossLinks(body)).toEqual([]);
  });
});

describe('checkFlagTokens', () => {
  const flagsSource = [
    'export const FEATURE_FLAGS = {',
    "  MODE_NAV_V0_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV === 'true',",
    "  MODE_NAV_V1_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V1 === 'true',",
    "  MODE_NAV_V2_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2 === 'true',",
    '};',
  ].join('\n');

  it('passes a flag token that is a real symbol', () => {
    const body = 'Flags are build-time: `MODE_NAV_V2_ENABLED`.';
    expect(checkFlagTokens(body, flagsSource)).toEqual([]);
  });

  it('flags a token that does not exist in feature-flags.ts', () => {
    const body = 'Flags are build-time: `MODE_NAV_V3_ENABLED`.';
    const failures = checkFlagTokens(body, flagsSource);
    expect(failures).toHaveLength(1);
    expect(failures[0].token).toBe('MODE_NAV_V3_ENABLED');
  });
});

describe('checkLegacyTags', () => {
  it('passes the three defined legacy tags', () => {
    const body =
      'Tagged **legacy-current**, **legacy-superseded**, **legacy-historical**.';
    expect(checkLegacyTags(body)).toEqual([]);
  });

  it('flags a typo/undefined legacy tag', () => {
    const body = 'Tagged **legacy-obsolete** by mistake.';
    const failures = checkLegacyTags(body);
    expect(failures).toHaveLength(1);
    expect(failures[0].token).toBe('legacy-obsolete');
  });
});
