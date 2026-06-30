import { Project } from 'ts-morph';

import {
  analyzeProject,
  computeUnused,
  computeOrphans,
  flatten,
} from './check-i18n-orphan-keys';
import type { DefaultValueMisuse } from './check-i18n-orphan-keys';

function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

describe('analyzeProject — static key extraction', () => {
  it('1. multi-line t() call resolves the static key', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        't(',
        "  'foo.bar'",
        ');',
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.staticKeys.has('foo.bar')).toBe(true);
  });

  it('2. aliased destructuring (t: translate) resolves the static key', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t: translate } = useTranslation();',
        "translate('foo.bar');",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.staticKeys.has('foo.bar')).toBe(true);
  });

  it('3. bare destructuring (control) resolves the static key', () => {
    const project = makeProject({
      'a.tsx': ['const { t } = useTranslation();', "t('foo.bar');"].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.staticKeys.has('foo.bar')).toBe(true);
  });

  it('4b. member-access i18next.t() / i18n.t() calls are treated as t-calls (regression: error formatters)', () => {
    const project = makeProject({
      'a.ts': [
        "i18next.t('errors.networkError');",
        "i18n.t('recovery.goBack');",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.staticKeys.has('errors.networkError')).toBe(true);
    expect(result.staticKeys.has('recovery.goBack')).toBe(true);
  });

  it('4c. alias rebinding `const tr = t as ...` makes tr() a t-call (regression: WelcomeIntro)', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        'const tr = t as unknown as (k: string) => string;',
        "const x = tr('welcomeIntro.learner.card1.headline');",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.staticKeys.has('welcomeIntro.learner.card1.headline')).toBe(
      true,
    );
  });

  it('4. bare t() in a file with NO useTranslation import is treated as a t-call (wrapper-hook indirection)', () => {
    const project = makeProject({
      'a.tsx': "export const x = t('foo.bar');",
    });
    const result = analyzeProject(project);
    expect(result.staticKeys.has('foo.bar')).toBe(true);
  });
});

describe('analyzeProject — template literal markers', () => {
  it('5. template prefix only yields {prefix, suffix:""}', () => {
    const project = makeProject({
      'a.tsx': ['const { t } = useTranslation();', 't(`errors.${code}`);'].join(
        '\n',
      ),
    });
    const result = analyzeProject(project);
    expect(result.prefixMarkers).toContainEqual({
      prefix: 'errors.',
      suffix: '',
    });
    expect(result.multiVarViolations).toHaveLength(0);
  });

  it('6. template prefix AND suffix yields both segments', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        't(`onboarding.languageSetup.levels.${level}.label`);',
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.prefixMarkers).toContainEqual({
      prefix: 'onboarding.languageSetup.levels.',
      suffix: '.label',
    });
  });

  it('7. multi-interpolation template is a violation (no escape comment)', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        't(`dictation.${a}.pace.${p}`);',
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.multiVarViolations).toHaveLength(1);
    expect(result.multiVarViolations[0].line).toBe(2);
  });

  it('7b. multi-interpolation template with // i18n-allow-multi-var: escape is NOT a violation and still emits a marker', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        't(`dictation.${a}.pace.${p}`); // i18n-allow-multi-var: pace is a fixed enum',
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.multiVarViolations).toHaveLength(0);
    expect(result.prefixMarkers).toContainEqual({
      prefix: 'dictation.',
      suffix: '',
    });
  });

  it('7c. single-interpolation short prefix passes cleanly (no violation)', () => {
    const project = makeProject({
      'a.tsx': ['const { t } = useTranslation();', 't(`a.${x}`);'].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.multiVarViolations).toHaveLength(0);
    expect(result.prefixMarkers).toContainEqual({ prefix: 'a.', suffix: '' });
  });
});

describe('analyzeProject — literal extraction through ternary/cast/coalesce', () => {
  it('ternary over two literal keys records both as static keys (regression: must not be swept)', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        "const w = t(cond ? 'family.withdrawal.daysOne' : 'family.withdrawal.daysOther');",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.staticKeys.has('family.withdrawal.daysOne')).toBe(true);
    expect(result.staticKeys.has('family.withdrawal.daysOther')).toBe(true);
    expect(result.dynamicCallSites).toHaveLength(0);
  });

  it('?? fallback over literal keys records both as static keys', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        "t(maybeKey ?? 'fallback.key');",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.staticKeys.has('fallback.key')).toBe(true);
  });

  it('template literal hidden behind an `as` cast is still classified as a template', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        't(`errors.${code}` as TranslateKey);',
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.prefixMarkers).toContainEqual({
      prefix: 'errors.',
      suffix: '',
    });
    expect(result.dynamicCallSites).toHaveLength(0);
  });
});

describe('computeUnused — keep logic', () => {
  it('8. a static t() reference keeps all pluralised variants alive', () => {
    const allKeys = new Set(['count_one', 'count_other', 'dead.key']);
    const analysis = analyzeProject(
      makeProject({
        'a.tsx': ['const { t } = useTranslation();', "t('count');"].join('\n'),
      }),
    );
    const unused = computeUnused(allKeys, analysis, []);
    expect(unused).not.toContain('count_one');
    expect(unused).not.toContain('count_other');
    expect(unused).toContain('dead.key');
  });

  it('10. a KEEP_PATTERNS glob keeps multi-segment keys alive', () => {
    const allKeys = new Set([
      'errors.network.timeout',
      'errors.generic',
      'dead.key',
    ]);
    const analysis = analyzeProject(
      makeProject({ 'a.tsx': 'export const x=1;' }),
    );
    const unused = computeUnused(allKeys, analysis, [
      { pattern: 'errors.*', reason: 'x:1' },
    ]);
    expect(unused).not.toContain('errors.network.timeout');
    expect(unused).not.toContain('errors.generic');
    expect(unused).toContain('dead.key');
  });

  it('template prefix+suffix marker keeps only matching keys alive', () => {
    const allKeys = new Set([
      'onboarding.languageSetup.levels.b1.label',
      'onboarding.languageSetup.levels.advanced.label',
      'onboarding.languageSetup.levels.b1.foo',
    ]);
    const analysis = analyzeProject(
      makeProject({
        'a.tsx': [
          'const { t } = useTranslation();',
          't(`onboarding.languageSetup.levels.${level}.label`);',
        ].join('\n'),
      }),
    );
    const unused = computeUnused(allKeys, analysis, []);
    expect(unused).not.toContain('onboarding.languageSetup.levels.b1.label');
    expect(unused).not.toContain(
      'onboarding.languageSetup.levels.advanced.label',
    );
    expect(unused).toContain('onboarding.languageSetup.levels.b1.foo');
  });
});

describe('analyzeProject — dynamic call sites and orphans', () => {
  it('9. fully-dynamic t(getKey()) is recorded as a dynamic call site, not an orphan', () => {
    const allKeys = new Set(['some.real.key']);
    const project = makeProject({
      'a.tsx': ['const { t } = useTranslation();', 't(getKey());'].join('\n'),
    });
    const analysis = analyzeProject(project);
    expect(analysis.dynamicCallSites).toHaveLength(1);
    expect(analysis.dynamicCallSites[0].line).toBe(2);
    expect(computeOrphans(analysis, allKeys)).toHaveLength(0);
  });

  it('empty-prefix template literal routes to dynamic call sites, not prefix markers', () => {
    const project = makeProject({
      'a.tsx': ['const { t } = useTranslation();', 't(`${ns}.bar`);'].join(
        '\n',
      ),
    });
    const analysis = analyzeProject(project);
    expect(analysis.dynamicCallSites).toHaveLength(1);
    expect(analysis.prefixMarkers).toHaveLength(0);
  });

  it('orphan static key (not in en.json) is reported', () => {
    const allKeys = new Set(['present.key']);
    const analysis = analyzeProject(
      makeProject({
        'a.tsx': ['const { t } = useTranslation();', "t('missing.key');"].join(
          '\n',
        ),
      }),
    );
    const orphans = computeOrphans(analysis, allKeys);
    expect(orphans.map((o) => o.key)).toContain('missing.key');
  });
});

describe('analyzeProject — per-file directive escape', () => {
  it('11. // i18n-not-t directive in the first 10 lines suppresses t-call reads', () => {
    const project = makeProject({
      'a.tsx': [
        '// i18n-not-t: t',
        'export function t(x: unknown) { return x; }',
        't(somethingElse);',
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.dynamicCallSites).toHaveLength(0);
    expect(result.staticKeys.size).toBe(0);
  });

  it('11b. // i18n-not-t directive outside the first 10 lines is ignored', () => {
    const project = makeProject({
      'a.tsx': [
        ...Array.from({ length: 11 }, (_, i) => `const pad${i} = ${i};`),
        '// i18n-not-t: t',
        "t('foo.bar');",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.staticKeys.has('foo.bar')).toBe(true);
  });
});

describe('analyzeProject — namespace misuse (preserved from regex checker)', () => {
  it('colon-prefix key is flagged as misuse, not a static key', () => {
    const project = makeProject({
      'a.tsx': ['const { t } = useTranslation();', "t('common:ok');"].join(
        '\n',
      ),
    });
    const result = analyzeProject(project);
    expect(result.misuse.some((m) => m.kind === 'colon-key')).toBe(true);
    expect(result.staticKeys.has('common:ok')).toBe(false);
  });

  it("useTranslation('ns') namespace argument is flagged as misuse", () => {
    const project = makeProject({
      'a.tsx': "const { t } = useTranslation('common');",
    });
    const result = analyzeProject(project);
    expect(result.misuse.some((m) => m.kind === 'useTranslation-arg')).toBe(
      true,
    );
  });
});

describe('flatten (preserved helper)', () => {
  it('flattens nested objects into dotted paths', () => {
    const keys = flatten({ a: { b: 'x' }, c: 'y' });
    expect(keys.has('a.b')).toBe(true);
    expect(keys.has('c')).toBe(true);
  });
});

describe('analyzeProject — defaultValue misuse guard', () => {
  it('flags a t() call with a string-literal defaultValue', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        "t('some.key', { defaultValue: 'English fallback' });",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    const hits: DefaultValueMisuse[] = result.defaultValueMisuse;
    expect(hits).toHaveLength(1);
    expect(hits[0].key).toBe('some.key');
    expect(hits[0].line).toBe(2);
  });

  it('does NOT flag a t() call with no options object', () => {
    const project = makeProject({
      'a.tsx': ['const { t } = useTranslation();', "t('some.key');"].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.defaultValueMisuse).toHaveLength(0);
  });

  it('does NOT flag a t() call with options but no defaultValue', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        "t('some.key', { count: 1 });",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.defaultValueMisuse).toHaveLength(0);
  });

  it('flags a t() call where defaultValue is a non-string (identifier)', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        "t('some.key', { defaultValue: someVar });",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.defaultValueMisuse).toHaveLength(1);
    expect(result.defaultValueMisuse[0].key).toBe('some.key');
  });

  it('flags dynamic enum-like defaultValue fallbacks on template keys', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        't(`parentView.retention.${subject.retentionStatus}.label`, {',
        '  defaultValue: subject.retentionStatus,',
        '});',
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.defaultValueMisuse).toHaveLength(1);
    expect(result.defaultValueMisuse[0].key).toBe(
      '`parentView.retention.${subject.retentionStatus}.label`',
    );
  });

  it('allows defaultValue only with an explicit inline escape', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',
        "t('some.key', { defaultValue: someVar }); // i18n-allow-default-value: third-party copy",
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.defaultValueMisuse).toHaveLength(0);
  });

  it('flags a t() call with a no-substitution template literal defaultValue', () => {
    const project = makeProject({
      'a.tsx': [
        'const { t } = useTranslation();',

        't(`some.key`, { defaultValue: `English fallback` });',
      ].join('\n'),
    });
    const result = analyzeProject(project);
    expect(result.defaultValueMisuse).toHaveLength(1);
    expect(result.defaultValueMisuse[0].key).toBe('some.key');
  });
});
