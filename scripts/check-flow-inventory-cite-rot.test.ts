import {
  classifyToken,
  extractBacktickTokens,
  resolveCitation,
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
