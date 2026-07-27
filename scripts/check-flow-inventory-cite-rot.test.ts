import {
  classifyToken,
  extractBacktickTokens,
  resolveCitation,
  extractDefinedRowIds,
  extractRemovedRowIds,
  checkRowIdCrossLinks,
  checkFlagTokens,
  checkLegacyTags,
  checkNavShellMatrixTabShapes,
  extractTabSetLiteral,
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

  it('collects bolded IDs when the Removed section is at the end of the document', () => {
    const body = [
      '## Removed in this refresh',
      '',
      '- **SUBJECT-99** — last section',
    ].join('\n');
    expect(extractRemovedRowIds(body)).toEqual(new Set(['SUBJECT-99']));
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

  it('flags a typo containing numbers or hyphens', () => {
    const body = 'Tagged **legacy-v2-mode** by mistake.';
    const failures = checkLegacyTags(body);
    expect(failures).toHaveLength(1);
    expect(failures[0].token).toBe('legacy-v2-mode');
  });
});

describe('extractTabSetLiteral', () => {
  const source = [
    'const STUDY_TABS: ReadonlySet<TabKey> = new Set([',
    "  'home',",
    "  'library',",
    "  'progress',",
    "  'more',",
    ']);',
    '',
    'const DYNAMIC_TABS: ReadonlySet<TabKey> = new Set(buildTabList());',
  ].join('\n');

  it('extracts a literal Set([...]) declaration', () => {
    expect(extractTabSetLiteral(source, 'STUDY_TABS')).toEqual(
      new Set(['home', 'library', 'progress', 'more']),
    );
  });

  it('returns null when the symbol is not declared at all', () => {
    expect(extractTabSetLiteral(source, 'NO_SUCH_TABS')).toBeNull();
  });

  it('returns null for a non-literal declaration (function call, not an array) — H1', () => {
    expect(extractTabSetLiteral(source, 'DYNAMIC_TABS')).toBeNull();
  });
});

describe('checkNavShellMatrixTabShapes', () => {
  const LEGACY_FILE = 'apps/mobile/src/lib/legacy-navigation-contract.ts';
  const CONTRACT_FILE = 'apps/mobile/src/lib/navigation-contract.ts';
  const V2_FILE = 'apps/mobile/src/hooks/use-navigation-contract.ts';

  const legacySource = [
    'const LEARNER_TABS: ReadonlySet<string> = new Set([',
    "  'home',",
    "  'library',",
    "  'progress',",
    "  'more',",
    ']);',
    '',
    'const STUDY_MODE_TABS: ReadonlySet<string> = new Set([',
    "  'home',",
    "  'library',",
    "  'progress',",
    "  'more',",
    ']);',
  ].join('\n');
  const contractSource = [
    'const STUDY_TABS: ReadonlySet<TabKey> = new Set([',
    "  'home',",
    "  'library',",
    "  'progress',",
    "  'more',",
    ']);',
    '',
    'const PROXY_TABS: ReadonlySet<TabKey> = new Set(computeProxyTabs());',
  ].join('\n');
  const v2Source =
    "const V2_TABS: ReadonlySet<string> = new Set(['mentor', 'subjects', 'journal']);";

  const contractSources: Record<string, string> = {
    [LEGACY_FILE]: legacySource,
    [CONTRACT_FILE]: contractSource,
    [V2_FILE]: v2Source,
  };

  function docWithMatrixRow(cellText: string): string {
    return [
      '## Navigation shell matrix',
      '',
      '| Audience | flags-off | prod build |',
      '|---|---|---|',
      `| Solo-owner learner | ${cellText} | same |`,
      '',
      '## Next section',
    ].join('\n');
  }

  it("passes when a cell's claimed tab list matches the real Set", () => {
    const body = docWithMatrixRow(
      '4: home, library, progress, more (`LEARNER_TABS`, legacy:1-6)',
    );
    expect(checkNavShellMatrixTabShapes(body, contractSources)).toEqual([]);
  });

  it("fails when a cell's claimed tab list does not match the real Set", () => {
    const body = docWithMatrixRow(
      '3: home, library, progress (`LEARNER_TABS`, legacy:1-6)',
    );
    const failures = checkNavShellMatrixTabShapes(body, contractSources);
    expect(failures).toHaveLength(1);
    expect(failures[0].symbol).toBe('LEARNER_TABS');
    expect(failures[0].reason).toContain(
      'doc claims {home, library, progress}',
    );
    expect(failures[0].reason).toContain(
      'LEARNER_TABS resolves to {home, library, more, progress}',
    );
  });

  it('skips a shorthand cell that cites a real symbol but names no tabs', () => {
    const body = docWithMatrixRow('same (`STUDY_MODE_TABS`, legacy:8-13)');
    expect(checkNavShellMatrixTabShapes(body, contractSources)).toEqual([]);
  });

  it("fails loudly (not silently) when a cited symbol's Set literal cannot be resolved — H1", () => {
    const body = docWithMatrixRow(
      '3: home, library, progress (`PROXY_TABS`, contract:1-2)',
    );
    const failures = checkNavShellMatrixTabShapes(body, contractSources);
    expect(failures).toHaveLength(1);
    expect(failures[0].symbol).toBe('PROXY_TABS');
    expect(failures[0].reason).toContain('could not be resolved');
  });

  it("passes regardless of claim-token order relative to the Set literal's declaration order", () => {
    const body = docWithMatrixRow(
      '4: more, progress, library, home (`LEARNER_TABS`, legacy:1-6)',
    );
    expect(checkNavShellMatrixTabShapes(body, contractSources)).toEqual([]);
  });

  it('does not read a tab token from trailing commentary after the citation as part of the claim', () => {
    // "library" only appears AFTER the citation's closing paren — must not be
    // folded into LEARNER_TABS's claim (which would wrongly pass a
    // 5-tab claim against the real 4-tab set, or otherwise corrupt it).
    const body = docWithMatrixRow(
      '4: home, progress, more (`LEARNER_TABS`, legacy:1-6) — library tab unrelated commentary',
    );
    const failures = checkNavShellMatrixTabShapes(body, contractSources);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('doc claims {home, more, progress}');
  });

  it("scopes each symbol's claim to its own semicolon-separated clause, not the whole cell", () => {
    const body = docWithMatrixRow(
      'family mode (default): home, more, progress (`STUDY_MODE_TABS`, legacy:8-13); study: 4 (`LEARNER_TABS`, legacy:1-6)',
    );
    // STUDY_MODE_TABS's clause claims {home, more, progress} — 3 tabs, but its
    // real Set has 4 (missing "library"), so THIS clause must fail...
    const failures = checkNavShellMatrixTabShapes(body, contractSources);
    expect(failures).toHaveLength(1);
    expect(failures[0].symbol).toBe('STUDY_MODE_TABS');
    // ...while LEARNER_TABS's clause ("study: 4 (...)") names no tabs at all
    // and must be skipped, not incorrectly inheriting the other clause's tabs.
  });

  it('passes the real Navigation shell matrix cells unchanged (V2_TABS)', () => {
    const body = docWithMatrixRow(
      '**3: mentor, subjects, journal** (`V2_TABS`, use-navigation-contract.ts:22)',
    );
    expect(checkNavShellMatrixTabShapes(body, contractSources)).toEqual([]);
  });
});
