import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  buildBaselineForKeys,
  commitTranslatedLocaleAndBaseline,
  hashSourceString,
  selectGeminiDiffKeys,
} from './translate-gemini';

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
