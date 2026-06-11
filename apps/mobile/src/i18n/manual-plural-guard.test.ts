import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInstance } from 'i18next';
import en from './locales/en.json';
import pl from './locales/pl.json';

// F-065 / F-071 (WI-625) migrated every manual-pluralization site — hardcoded
// English ternaries like `count === 1 ? 'topic' : 'topics'` or suffix concat
// `minute${n === 1 ? '' : 's'}` — to i18next count-based plural keys. Manual
// plurals are doubly broken: they render English words into every locale AND
// bake in a binary singular/plural model that fails multi-category languages
// (Polish needs one/few/many). This guard prevents NEW manual-plural sites
// from appearing, keeps Polish plural families complete, and verifies the
// runtime actually selects the right category.
//
// Mirrors the forward-only pattern of persona-fossil-guard.test.ts.

// ---------------------------------------------------------------------------
// Part 1 — source guard: no new manual-plural patterns in mobile source
// ---------------------------------------------------------------------------

// All current sites were migrated in WI-625, so the allowlist starts empty.
// Do not add entries — route new plural copy through t('…', { count }).
const KNOWN_SITES = new Set<string>([]);

// `n === 1 ? '' : 's'` (or reversed via !==) — pluralizing suffix concat.
const SUFFIX_CONCAT_PATTERNS: RegExp[] = [
  /[!=]==\s*1\s*\?\s*(['"`])\1\s*:\s*(['"`])e?s\2/,
  /[!=]==\s*1\s*\?\s*(['"`])e?s\1\s*:\s*(['"`])\2/,
];

// `n === 1 ? '<a>' : '<b>'` where the branches' last words differ only by a
// plural suffix (topic/topics, hour/hours, '1 started topic'/`${n} started
// topics`). Non-plural count ternaries ('_one'/'_other' mocks, two unrelated
// copy strings) do not match the last-word check.
const COUNT_TERNARY =
  /[!=]==\s*1\s*\?\s*(['"`])((?:(?!\1)[\s\S])*)\1\s*:\s*(['"`])((?:(?!\3)[\s\S])*)\3/g;

function words(s: string): Set<string> {
  return new Set((s.match(/[A-Za-z]+/g) ?? []).map((w) => w.toLowerCase()));
}

function isPluralPair(a: string, b: string): boolean {
  // Flag when any word in one branch is the s/es-plural of a word in the
  // other ('milestone reached' vs 'milestones reached', 'topic' vs 'topics').
  const aWords = words(a);
  const bWords = words(b);
  for (const w of aWords) {
    if (bWords.has(`${w}s`) || bWords.has(`${w}es`)) return true;
  }
  for (const w of bWords) {
    if (aWords.has(`${w}s`) || aWords.has(`${w}es`)) return true;
  }
  return false;
}

function findManualPlural(source: string): string | null {
  for (const pattern of SUFFIX_CONCAT_PATTERNS) {
    const m = pattern.exec(source);
    if (m) return m[0];
  }
  COUNT_TERNARY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COUNT_TERNARY.exec(source)) !== null) {
    if (isPluralPair(m[2] ?? '', m[4] ?? '')) return m[0];
  }
  return null;
}

function listMobileSources(): string[] {
  const repoRoot = resolve(__dirname, '../../../..');
  const out = execSync(
    'git ls-files "apps/mobile/src/**/*.ts" "apps/mobile/src/**/*.tsx"',
    { cwd: repoRoot, encoding: 'utf-8' },
  );
  return (
    out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      // Test files legitimately emulate plural logic inside translation mocks
      // (mock-i18n.ts, inline useTranslation mocks); user-visible copy never
      // lives there, so they are out of the guard's scope.
      .filter((l) => !/\.test\.tsx?$/.test(l))
      .filter((l) => !l.includes('apps/mobile/src/test-utils/'))
  );
}

describe('WI-625-GUARD — manual-pluralization forward-only guard', () => {
  const repoRoot = resolve(__dirname, '../../../..');
  const files = listMobileSources();

  it('finds mobile source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('does not introduce NEW manual-plural patterns outside the allowlist', () => {
    const violators: string[] = [];
    for (const file of files) {
      const abs = resolve(repoRoot, file);
      if (!existsSync(abs)) continue;
      const hit = findManualPlural(readFileSync(abs, 'utf-8'));
      if (hit !== null && !KNOWN_SITES.has(file.replace(/\\/g, '/'))) {
        violators.push(`${file}: ${hit.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }

    if (violators.length > 0) {
      throw new Error(
        `Manual-pluralization pattern(s) found:\n` +
          violators.map((v) => `  - ${v}`).join('\n') +
          `\n\nHardcoded plural ternaries render English into every locale ` +
          `and break multi-category languages (Polish needs one/few/many). ` +
          `Use i18next plural keys instead: t('ns.key', { count }) with ` +
          `key_one/key_other in en.json (pl additionally needs key_few/key_many).`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Part 2 — Polish plural-category completeness
// ---------------------------------------------------------------------------

type Nested = { [k: string]: string | Nested };

function flattenLocale(obj: Nested, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      result[fullKey] = v;
    } else {
      Object.assign(result, flattenLocale(v, fullKey));
    }
  }
  return result;
}

const PLURAL_SUFFIXES = ['_one', '_other', '_few', '_many'] as const;

function pluralFamilies(flat: Record<string, string>): Set<string> {
  const families = new Set<string>();
  for (const key of Object.keys(flat)) {
    for (const suffix of PLURAL_SUFFIXES) {
      if (key.endsWith(suffix)) {
        families.add(key.slice(0, -suffix.length));
      }
    }
  }
  return families;
}

describe('Polish plural-category completeness', () => {
  const enFlat = flattenLocale(en as Nested);
  const plFlat = flattenLocale(pl as Nested);

  it('every en plural family carries pl _few and _many (and _one or a bare key)', () => {
    // i18next resolves pl counts through one/few/many. A family missing
    // _few/_many silently falls back to the bare key — the SINGULAR Polish
    // form — for counts 2+, which is exactly the F-071 bug.
    const incomplete = Array.from(pluralFamilies(enFlat))
      .filter(
        (family) =>
          !(
            `${family}_few` in plFlat &&
            `${family}_many` in plFlat &&
            (`${family}_one` in plFlat || family in plFlat)
          ),
      )
      .sort();

    expect(incomplete).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Part 3 — runtime category selection (counts 1 / 2 / 5 / 22)
// ---------------------------------------------------------------------------

describe('runtime plural category selection', () => {
  const enFlat = flattenLocale(en as Nested);
  const plFlat = flattenLocale(pl as Nested);

  // Mix of WI-625-new and pre-existing families, including a bare+_other one.
  const SAMPLE_FAMILIES = [
    'session.livingBook.pageCount',
    'parentView.index.timeAgo.days',
    'milestoneCard.wordCount',
    'quiz.play.foundThemClues',
    'progress.weeklyReport.mini.sessions',
  ];

  // Polish CLDR cardinal rules: 1 → one; 2-4 (and 22-24, …) → few; 0, 5-21,
  // 25-31, … → many.
  const PL_EXPECTED: ReadonlyArray<readonly [number, string]> = [
    [1, '_one'],
    [2, '_few'],
    [5, '_many'],
    [22, '_few'],
  ];

  const i18n = createInstance();
  beforeAll(async () => {
    await i18n.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: en },
        pl: { translation: pl },
      },
      interpolation: { escapeValue: false },
    });
  });

  function raw(
    flat: Record<string, string>,
    family: string,
    suffix: string,
    count: number,
  ): string {
    const template = flat[`${family}${suffix}`] ?? flat[family];
    expect(template).toBeDefined();
    return (template as string).replace(/\{\{count\}\}/g, String(count));
  }

  it.each(SAMPLE_FAMILIES)(
    'pl selects one/few/many correctly for %s',
    (family) => {
      for (const [count, suffix] of PL_EXPECTED) {
        expect(i18n.t(family, { count, lng: 'pl' })).toBe(
          raw(plFlat, family, suffix, count),
        );
      }
    },
  );

  it.each(SAMPLE_FAMILIES)(
    'en selects one/other correctly for %s',
    (family) => {
      expect(i18n.t(family, { count: 1, lng: 'en' })).toBe(
        raw(enFlat, family, '_one', 1),
      );
      for (const count of [2, 5, 22]) {
        expect(i18n.t(family, { count, lng: 'en' })).toBe(
          raw(enFlat, family, '_other', count),
        );
      }
    },
  );
});
