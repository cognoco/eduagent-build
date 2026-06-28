import { Project, type SourceFile } from 'ts-morph';

import {
  classifyJsxAttributeProp,
  diffAgainstBaseline,
  findViolationsInSourceFile,
  isTranslatableProse,
  normalizeText,
  type BaselineEntry,
  type Violation,
} from './check-i18n-jsx-literals';

// Real ts-morph parse of in-memory TSX — no mocks. Exercises the same AST walk
// the CLI runs against apps/mobile/src/**.
function parse(code: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4 /* react-jsx */ },
  });
  return project.createSourceFile('Test.tsx', code);
}

function kindsAndText(code: string): Array<{ kind: string; text: string }> {
  return findViolationsInSourceFile(parse(code)).map((v) => ({
    kind: v.kind,
    text: v.text,
  }));
}

function kindPropText(
  code: string,
): Array<{ kind: string; prop?: string; text: string }> {
  return findViolationsInSourceFile(parse(code)).map((v) => ({
    kind: v.kind,
    prop: v.prop,
    text: v.text,
  }));
}

describe('normalizeText', () => {
  it('collapses internal whitespace runs and trims', () => {
    expect(normalizeText('  Add\n    child\t to account ')).toBe(
      'Add child to account',
    );
  });
});

describe('isTranslatableProse', () => {
  it('accepts a 2+ letter word', () => {
    expect(isTranslatableProse('Save')).toBe(true);
    expect(isTranslatableProse('5 min left')).toBe(true); // "min"
  });

  it('rejects punctuation, bare numbers, and single glyphs', () => {
    expect(isTranslatableProse('—')).toBe(false);
    expect(isTranslatableProse('5')).toBe(false);
    expect(isTranslatableProse('×')).toBe(false);
    expect(isTranslatableProse('a')).toBe(false); // single letter
    expect(isTranslatableProse('💾')).toBe(false); // emoji-only
  });
});

describe('findViolationsInSourceFile', () => {
  it('flags raw JsxText between tags', () => {
    expect(kindsAndText('const C = () => <Text>Add child</Text>;')).toEqual([
      { kind: 'jsx-text', text: 'Add child' },
    ]);
  });

  it('flags a string literal rendered as a JSX child', () => {
    expect(kindsAndText("const C = () => <Text>{'Continue'}</Text>;")).toEqual([
      { kind: 'jsx-child-string', text: 'Continue' },
    ]);
  });

  it('flags both branches of a conditional JSX child', () => {
    expect(
      kindsAndText("const C = () => <Text>{ok ? 'Yes' : 'No'}</Text>;"),
    ).toEqual([
      { kind: 'jsx-child-string', text: 'Yes' },
      { kind: 'jsx-child-string', text: 'No' },
    ]);
  });

  it('flags the rendered side of a && / ?? JSX child', () => {
    expect(
      kindsAndText("const C = () => <Text>{done && 'Saved'}</Text>;"),
    ).toEqual([{ kind: 'jsx-child-string', text: 'Saved' }]);
  });

  it('flags hardcoded text sitting alongside an interpolation', () => {
    expect(kindsAndText('const C = () => <Text>Hello {name}</Text>;')).toEqual([
      { kind: 'jsx-text', text: 'Hello' },
    ]);
  });

  it('flags user-copy JSX attribute literals', () => {
    expect(
      kindsAndText('const C = () => <Btn label="Continue" title="Delete" />;'),
    ).toEqual([
      { kind: 'jsx-attribute-string', text: 'Continue' },
      { kind: 'jsx-attribute-string', text: 'Delete' },
    ]);
  });

  it('records the prop name for JSX attribute literals', () => {
    expect(
      kindPropText(
        'const C = () => <Btn accessibilityLabel="Go back" placeholder="Search library" />;',
      ),
    ).toEqual([
      {
        kind: 'jsx-attribute-string',
        prop: 'accessibilityLabel',
        text: 'Go back',
      },
      {
        kind: 'jsx-attribute-string',
        prop: 'placeholder',
        text: 'Search library',
      },
    ]);
  });

  it('flags conditional, logical, and nullish string attribute expressions', () => {
    expect(
      kindPropText(
        "const C = () => <Btn label={ok ? 'Continue' : 'Try again'} message={loading && 'Saving now'} title={name ?? 'Unknown learner'} />;",
      ),
    ).toEqual([
      { kind: 'jsx-attribute-string', prop: 'label', text: 'Continue' },
      { kind: 'jsx-attribute-string', prop: 'label', text: 'Try again' },
      { kind: 'jsx-attribute-string', prop: 'message', text: 'Saving now' },
      { kind: 'jsx-attribute-string', prop: 'title', text: 'Unknown learner' },
    ]);
  });

  it('flags template and concatenated attribute content shapes', () => {
    expect(
      kindPropText(
        "const C = () => <Btn message={`This book has ${count} topics`} label={'Save ' + name} />;",
      ),
    ).toEqual([
      {
        kind: 'jsx-attribute-string',
        prop: 'message',
        text: 'This book has ${} topics',
      },
      { kind: 'jsx-attribute-string', prop: 'label', text: 'Save ${}' },
    ]);
  });

  it('does NOT flag non-copy, unknown, computed, or translated attribute values', () => {
    expect(
      kindPropText(
        'const C = () => <><meta content="width=device-width, initial-scale=1" /><Btn testID="continue-button" style="primary" accessibilityRole="button" routeId="home-route" tone="friendly" label="home.title" title={t(\'home.title\')} message={format(\'hello world\')} {...props} /></>;',
      ),
    ).toEqual([]);
  });

  it('does NOT flag a string buried in a call argument', () => {
    // format('hi') is computed, not rendered directly — must not be flagged.
    expect(
      kindsAndText("const C = () => <Text>{format('hello world')}</Text>;"),
    ).toEqual([]);
  });

  it('does NOT flag whitespace-only or punctuation-only JsxText', () => {
    expect(kindsAndText('const C = () => <View>{x}</View>;')).toEqual([]);
    expect(kindsAndText('const C = () => <Text>—</Text>;')).toEqual([]);
  });

  it('does NOT flag a t() call rendered as a child', () => {
    expect(
      kindsAndText("const C = () => <Text>{t('home.title')}</Text>;"),
    ).toEqual([]);
  });
});

describe('diffAgainstBaseline', () => {
  const v = (
    file: string,
    kind: Violation['kind'],
    text: string,
    prop?: string,
  ): Violation => ({ file, line: 1, kind, text, prop });

  it('returns nothing new when all current literals are grandfathered', () => {
    const current = [v('a.tsx', 'jsx-text', 'Save')];
    const baseline: BaselineEntry[] = [
      { file: 'a.tsx', kind: 'jsx-text', text: 'Save' },
    ];
    expect(diffAgainstBaseline(current, baseline)).toEqual({
      newViolations: [],
      cleanedBaselineEntries: [],
    });
  });

  it('flags a literal absent from the baseline as new', () => {
    const current = [
      v('a.tsx', 'jsx-text', 'Save'),
      v('a.tsx', 'jsx-text', 'Delete'),
    ];
    const baseline: BaselineEntry[] = [
      { file: 'a.tsx', kind: 'jsx-text', text: 'Save' },
    ];
    expect(diffAgainstBaseline(current, baseline).newViolations).toEqual([
      v('a.tsx', 'jsx-text', 'Delete'),
    ]);
  });

  it('treats the same text with a different kind as a distinct entry', () => {
    const current = [v('a.tsx', 'jsx-child-string', 'Save')];
    const baseline: BaselineEntry[] = [
      { file: 'a.tsx', kind: 'jsx-text', text: 'Save' },
    ];
    // jsx-child-string Save is NOT covered by the jsx-text Save baseline entry.
    expect(diffAgainstBaseline(current, baseline).newViolations).toEqual([
      v('a.tsx', 'jsx-child-string', 'Save'),
    ]);
  });

  it('treats the same attribute text on different props as distinct entries', () => {
    const current = [
      v('a.tsx', 'jsx-attribute-string', 'Save', 'label'),
      v('a.tsx', 'jsx-attribute-string', 'Save', 'title'),
    ];
    const baseline: BaselineEntry[] = [
      {
        file: 'a.tsx',
        kind: 'jsx-attribute-string',
        prop: 'label',
        text: 'Save',
      },
    ];
    expect(diffAgainstBaseline(current, baseline).newViolations).toEqual([
      v('a.tsx', 'jsx-attribute-string', 'Save', 'title'),
    ]);
  });

  it('deduplicates repeated new violations so each surfaces once', () => {
    const current = [
      v('a.tsx', 'jsx-text', 'Save'),
      v('a.tsx', 'jsx-text', 'Save'),
    ];
    expect(diffAgainstBaseline(current, []).newViolations).toEqual([
      v('a.tsx', 'jsx-text', 'Save'),
    ]);
  });

  it('reports baseline entries no longer present so they can be pruned', () => {
    const current = [v('a.tsx', 'jsx-text', 'Save')];
    const baseline: BaselineEntry[] = [
      { file: 'a.tsx', kind: 'jsx-text', text: 'Save' },
      { file: 'a.tsx', kind: 'jsx-text', text: 'Gone' },
    ];
    expect(
      diffAgainstBaseline(current, baseline).cleanedBaselineEntries,
    ).toEqual([{ file: 'a.tsx', kind: 'jsx-text', text: 'Gone' }]);
  });
});

describe('classifyJsxAttributeProp', () => {
  it('classifies known copy props and copy-like suffixes', () => {
    expect(classifyJsxAttributeProp('label')).toBe('copy');
    expect(classifyJsxAttributeProp('title')).toBe('copy');
    expect(classifyJsxAttributeProp('message')).toBe('copy');
    expect(classifyJsxAttributeProp('accessibilityLabel')).toBe('copy');
    expect(classifyJsxAttributeProp('aria-label')).toBe('copy');
    expect(classifyJsxAttributeProp('cancelText')).toBe('copy');
    expect(classifyJsxAttributeProp('emptyStateTitle')).toBe('copy');
  });

  it('classifies IDs, roles, styles, and references as non-copy', () => {
    expect(classifyJsxAttributeProp('testID')).toBe('non-copy');
    expect(classifyJsxAttributeProp('style')).toBe('non-copy');
    expect(classifyJsxAttributeProp('accessibilityRole')).toBe('non-copy');
    expect(classifyJsxAttributeProp('nativeID')).toBe('non-copy');
    expect(classifyJsxAttributeProp('data-testid')).toBe('non-copy');
    expect(classifyJsxAttributeProp('aria-labelledby')).toBe('non-copy');
    expect(classifyJsxAttributeProp('routeId')).toBe('non-copy');
    expect(classifyJsxAttributeProp('routeName')).toBe('non-copy');
  });

  it('classifies neutral custom props as unknown', () => {
    expect(classifyJsxAttributeProp('tone')).toBe('unknown');
  });
});
