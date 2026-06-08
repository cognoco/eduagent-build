import { Project, type SourceFile } from 'ts-morph';

import {
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

  it('does NOT flag attribute string literals (props are out of scope)', () => {
    expect(
      kindsAndText('const C = () => <Btn label="Continue" title="Delete" />;'),
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
  ): Violation => ({ file, line: 1, kind, text });

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
