import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  buildBaselineForKeys,
  commitPrunedLocaleAndBaseline,
  commitTranslatedLocaleAndBaseline,
  hashSourceString,
  selectGeminiDiffKeys,
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

describe('committed source-baseline.json', () => {
  it('contains current source hashes for every committed target locale key', () => {
    const source = JSON.parse(
      fs.readFileSync(path.join(REAL_LOCALES_DIR, 'en.json'), 'utf-8'),
    ) as NestedStrings;
    const baselineFile = JSON.parse(
      fs.readFileSync(REAL_SOURCE_BASELINE_PATH, 'utf-8'),
    ) as Record<string, Record<string, string>>;

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
    expect(JSON.parse(fs.readFileSync(baselinePath, 'utf-8'))).toEqual({
      de: { 'common.save': hashSourceString('Save') },
    });
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
