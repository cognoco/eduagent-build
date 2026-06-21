import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  buildBaselineForKeys,
  isLocalePluralVariant,
  mergeTranslatedIntoPrevious,
  commitPrunedLocaleAndBaseline,
  commitTranslatedLocaleAndBaseline,
  expandSourceBaselineFile,
  hashSourceString,
  selectGeminiDiffKeys,
  validatePruneOnlyLocale,
} from './translate-gemini';

type NestedStrings = { [k: string]: string | NestedStrings };

const REAL_I18N_DIR = path.resolve(__dirname, '../apps/mobile/src/i18n');
const REAL_LOCALES_DIR = path.join(REAL_I18N_DIR, 'locales');
const REAL_SOURCE_BASELINE_PATH = path.join(
  REAL_I18N_DIR,
  'source-baseline.json',
);
const EXPECTED_TARGET_LANGUAGES = ['nb', 'de', 'es', 'pt', 'pl', 'ja'];

function flattenFixtureKeys(
  obj: NestedStrings,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else {
      Object.assign(result, flattenFixtureKeys(value, fullKey));
    }
  }
  return result;
}

describe('selectGeminiDiffKeys', () => {
  it('selects an existing key when its English source string changed', () => {
    const source = {
      common: { save: 'Save now', cancel: 'Cancel' },
    };
    const target = {
      common: { save: 'Speichern', cancel: 'Abbrechen' },
    };
    const baseline = {
      'common.save': hashSourceString('Save'),
      'common.cancel': hashSourceString('Cancel'),
    };

    expect(
      selectGeminiDiffKeys({ source, target, baseline, full: false }),
    ).toEqual({
      translateKeys: ['common.save'],
      removedKeys: [],
    });
  });

  it('selects added source keys and removed target keys', () => {
    const source = {
      common: { save: 'Save', done: 'Done' },
    };
    const target = {
      common: { save: 'Speichern', old: 'Alt' },
    };
    const baseline = buildBaselineForKeys(source, [
      'common.save',
      'common.old',
    ]);

    expect(
      selectGeminiDiffKeys({ source, target, baseline, full: false }),
    ).toEqual({
      translateKeys: ['common.done'],
      removedKeys: ['common.old'],
    });
  });

  it('does not retranslate unchanged source keys, preserving target manual edits', () => {
    const source = {
      common: { save: 'Save', cancel: 'Cancel' },
    };
    const target = {
      common: {
        save: 'Speichern',
        cancel: 'Manuell bearbeitete Abbrechen-Kopie',
      },
    };
    const baseline = buildBaselineForKeys(source, [
      'common.save',
      'common.cancel',
    ]);

    expect(
      selectGeminiDiffKeys({ source, target, baseline, full: false }),
    ).toEqual({
      translateKeys: [],
      removedKeys: [],
    });
  });

  it('selects every source key in full mode and still reports removed target keys', () => {
    const source = {
      common: { save: 'Save', cancel: 'Cancel' },
    };
    const target = {
      common: { save: 'Speichern', old: 'Alt' },
    };

    expect(
      selectGeminiDiffKeys({
        source,
        target,
        baseline: null,
        full: true,
      }),
    ).toEqual({
      translateKeys: ['common.save', 'common.cancel'],
      removedKeys: ['common.old'],
    });
  });

  it('treats missing or partial baselines conservatively for existing target keys', () => {
    const source = {
      common: { save: 'Save', cancel: 'Cancel' },
    };
    const target = {
      common: { save: 'Speichern', cancel: 'Abbrechen' },
    };
    const partialBaseline = buildBaselineForKeys(source, ['common.save']);

    expect(
      selectGeminiDiffKeys({
        source,
        target,
        baseline: partialBaseline,
        full: false,
      }),
    ).toEqual({
      translateKeys: ['common.cancel'],
      removedKeys: [],
    });

    expect(
      selectGeminiDiffKeys({
        source,
        target,
        baseline: null,
        full: false,
      }),
    ).toEqual({
      translateKeys: ['common.save', 'common.cancel'],
      removedKeys: [],
    });
  });

  it('treats malformed baseline entries as missing', () => {
    const source = {
      common: { save: 'Save', cancel: 'Cancel' },
    };
    const target = {
      common: { save: 'Speichern', cancel: 'Abbrechen' },
    };
    const baseline = {
      'common.save': hashSourceString('Save'),
      'common.cancel': 42,
    };

    expect(
      selectGeminiDiffKeys({ source, target, baseline, full: false }),
    ).toEqual({
      translateKeys: ['common.cancel'],
      removedKeys: [],
    });
  });
});

describe('locale-specific CLDR plural variants (WI-621 regression)', () => {
  // English only carries _one/_other; Polish legitimately adds _few/_many.
  const sourceFlat = {
    'relearn.daysOverdue_one': '{{count}} day overdue',
    'relearn.daysOverdue_other': '{{count}} days overdue',
    'common.save': 'Save',
  };

  describe('isLocalePluralVariant', () => {
    it('accepts a locale plural suffix when en carries ANY family member', () => {
      expect(isLocalePluralVariant('relearn.daysOverdue_few', sourceFlat)).toBe(
        true,
      );
      expect(
        isLocalePluralVariant('relearn.daysOverdue_many', sourceFlat),
      ).toBe(true);
    });

    it('rejects plural-suffixed keys whose family is gone from en', () => {
      expect(isLocalePluralVariant('old.removed_few', sourceFlat)).toBe(false);
    });

    it('rejects non-plural keys', () => {
      expect(isLocalePluralVariant('common.save', sourceFlat)).toBe(false);
    });
  });

  describe('mergeTranslatedIntoPrevious', () => {
    it('preserves hand-authored locale plural variants through a real write', () => {
      // The exact failure mode that deleted pl _few/_many twice on PR #985:
      // a translate run for unrelated keys must not drop locale-only plural
      // forms of a still-live family.
      const previousFlat = {
        'relearn.daysOverdue_one': '{{count}} dzień zaległości',
        'relearn.daysOverdue_few': '{{count}} dni zaległości',
        'relearn.daysOverdue_many': '{{count}} dni zaległości',
        'relearn.daysOverdue_other': '{{count}} dni zaległości',
        'common.save': 'Zapisz',
      };
      const translatedFlat = { 'common.save': 'Zapisz teraz' };

      const merged = mergeTranslatedIntoPrevious(
        previousFlat,
        translatedFlat,
        sourceFlat,
      );

      expect(merged['relearn.daysOverdue_few']).toBe(
        '{{count}} dni zaległości',
      );
      expect(merged['relearn.daysOverdue_many']).toBe(
        '{{count}} dni zaległości',
      );
      expect(merged['common.save']).toBe('Zapisz teraz');
    });

    it('still drops keys whose entire family was removed from en', () => {
      const previousFlat = {
        'old.removed_one': 'x',
        'old.removed_few': 'y',
        'old.plain': 'z',
        'common.save': 'Zapisz',
      };
      const merged = mergeTranslatedIntoPrevious(previousFlat, {}, sourceFlat);
      expect(merged).toEqual({ 'common.save': 'Zapisz' });
    });
  });
});

describe('prune-only validation', () => {
  it('does not block pruning on unrelated existing Polish glossary violations', () => {
    const source = {
      active: { sessionCta: 'Start session' },
    };
    const pruned = {
      active: { sessionCta: 'Rozpocznij spotkanie' },
    };
    const glossary = { session: { pl: 'sesja' } };

    const result = validatePruneOnlyLocale({
      source,
      pruned,
      removedKeys: ['legacy.removed'],
      lang: 'pl',
      glossary,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('still rejects prune-only output that keeps a removed key', () => {
    const source = {
      active: { sessionCta: 'Start session' },
    };
    const pruned = {
      active: { sessionCta: 'Rozpocznij sesję' },
      legacy: { removed: 'Stara wartość' },
    };

    const result = validatePruneOnlyLocale({
      source,
      pruned,
      removedKeys: ['legacy.removed'],
      lang: 'pl',
      glossary: { session: { pl: 'sesja' } },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'extra_key', key: 'legacy.removed' }),
    );
  });
});

describe('committed source-baseline.json', () => {
  it('contains current source hashes for every committed target locale key', () => {
    const source = JSON.parse(
      fs.readFileSync(path.join(REAL_LOCALES_DIR, 'en.json'), 'utf-8'),
    ) as NestedStrings;
    const baselineJson = JSON.parse(
      fs.readFileSync(REAL_SOURCE_BASELINE_PATH, 'utf-8'),
    );
    const baselineFile = expandSourceBaselineFile(baselineJson);

    expect(Object.keys(baselineFile).sort()).toEqual(
      EXPECTED_TARGET_LANGUAGES.toSorted(),
    );

    for (const lang of EXPECTED_TARGET_LANGUAGES) {
      const target = JSON.parse(
        fs.readFileSync(path.join(REAL_LOCALES_DIR, `${lang}.json`), 'utf-8'),
      ) as NestedStrings;
      const targetKeys = Object.keys(flattenFixtureKeys(target));

      expect(baselineFile[lang]).toEqual(
        buildBaselineForKeys(source, targetKeys),
      );
    }
  });
});

describe('buildBaselineForKeys', () => {
  it('hashes only selected English source strings', () => {
    const source = {
      common: { save: 'Save', cancel: 'Cancel' },
    };

    expect(buildBaselineForKeys(source, ['common.save'])).toEqual({
      'common.save': hashSourceString('Save'),
    });
  });
});

describe('commitTranslatedLocaleAndBaseline', () => {
  it('writes runtime locale JSON without baseline metadata, then writes the sidecar baseline', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-gemini-'));
    const targetPath = path.join(dir, 'de.json');
    const baselinePath = path.join(dir, 'source-baseline.json');
    const source = { common: { save: 'Save' } };
    const translated = { common: { save: 'Speichern' } };

    commitTranslatedLocaleAndBaseline({
      targetPath,
      baselinePath,
      baselineFile: {},
      lang: 'de',
      source,
      translated,
    });

    expect(JSON.parse(fs.readFileSync(targetPath, 'utf-8'))).toEqual(
      translated,
    );
    const baselineJson = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    expect(baselineJson).toEqual({
      version: 1,
      sourceHashes: { 'common.save': hashSourceString('Save') },
      locales: { de: 'allSourceKeys' },
    });
    expect(expandSourceBaselineFile(baselineJson)).toEqual({
      de: { 'common.save': hashSourceString('Save') },
    });
  });

  it('preserves stale per-locale hashes when committing one updated locale', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-gemini-'));
    const targetPath = path.join(dir, 'pt.json');
    const baselinePath = path.join(dir, 'source-baseline.json');
    const oldHash = hashSourceString('Save');
    const source = { common: { save: 'Save now' } };
    const translated = { common: { save: 'Salvar agora' } };

    commitTranslatedLocaleAndBaseline({
      targetPath,
      baselinePath,
      baselineFile: {
        de: { 'common.save': oldHash },
        pt: { 'common.save': oldHash },
      },
      lang: 'pt',
      source,
      translated,
    });

    const baselineJson = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    const expandedBaseline = expandSourceBaselineFile(baselineJson);

    expect(expandedBaseline.de).toEqual({ 'common.save': oldHash });
    expect(expandedBaseline.pt).toEqual({
      'common.save': hashSourceString('Save now'),
    });
    expect(
      selectGeminiDiffKeys({
        source,
        target: { common: { save: 'Speichern' } },
        baseline: expandedBaseline.de,
        full: false,
      }).translateKeys,
    ).toEqual(['common.save']);
    expect(
      selectGeminiDiffKeys({
        source,
        target: translated,
        baseline: expandedBaseline.pt,
        full: false,
      }).translateKeys,
    ).toEqual([]);
  });

  it('does not write the sidecar baseline when the locale write fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-gemini-'));
    const targetPath = path.join(dir, 'missing-dir', 'de.json');
    const baselinePath = path.join(dir, 'source-baseline.json');

    expect(() =>
      commitTranslatedLocaleAndBaseline({
        targetPath,
        baselinePath,
        baselineFile: {},
        lang: 'de',
        source: { common: { save: 'Save' } },
        translated: { common: { save: 'Speichern' } },
      }),
    ).toThrow();

    expect(fs.existsSync(baselinePath)).toBe(false);
  });
});

describe('expandSourceBaselineFile', () => {
  it('reads the compact sidecar format into per-locale source hashes', () => {
    expect(
      expandSourceBaselineFile({
        version: 1,
        sourceHashes: {
          'common.save': hashSourceString('Save'),
          'common.cancel': hashSourceString('Cancel'),
        },
        locales: {
          de: ['common.save'],
          nb: 'allSourceKeys',
        },
      }),
    ).toEqual({
      de: { 'common.save': hashSourceString('Save') },
      nb: {
        'common.save': hashSourceString('Save'),
        'common.cancel': hashSourceString('Cancel'),
      },
    });
  });
});

describe('commitPrunedLocaleAndBaseline', () => {
  it('does not write locale or baseline files during a dry run', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-gemini-'));
    const targetPath = path.join(dir, 'de.json');
    const baselinePath = path.join(dir, 'source-baseline.json');

    const committed = commitPrunedLocaleAndBaseline({
      dryRun: true,
      targetPath,
      baselinePath,
      baselineFile: {},
      lang: 'de',
      source: { common: { save: 'Save' } },
      translated: { common: { save: 'Speichern' } },
    });

    expect(committed).toBe(false);
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.existsSync(baselinePath)).toBe(false);
  });
});
