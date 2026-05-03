import { validateTranslation, computeChangedKeys } from './translate';

describe('validateTranslation', () => {
  // Use a source long enough that typical German translations stay well
  // under the 200% hard-fail ratio. "Save action" (11) → "Speichern" (9) = 82%.
  const source = {
    common: { save: 'Save action', cancel: 'Cancel button' },
    errors: { generic: 'Something went wrong. {{action}} to retry.' },
  };

  it('accepts valid translation with same keys and preserved variables', () => {
    const translated = {
      common: { save: 'Speichern', cancel: 'Abbrechen' },
      errors: {
        generic: 'Etwas ist schiefgelaufen. {{action}} um erneut zu versuchen.',
      },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects translation with missing keys', () => {
    const translated = {
      common: { save: 'Speichern' },
      errors: { generic: 'Fehler. {{action}}.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing_key', key: 'common.cancel' })
    );
  });

  it('rejects translation with extra keys', () => {
    const translated = {
      common: { save: 'Speichern', cancel: 'Abbrechen', extra: 'Bonus' },
      errors: { generic: 'Fehler. {{action}}.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'extra_key', key: 'common.extra' })
    );
  });

  it('rejects translation with missing interpolation variable', () => {
    const translated = {
      common: { save: 'Speichern', cancel: 'Abbrechen' },
      errors: { generic: 'Etwas ist schiefgelaufen.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        type: 'missing_variable',
        key: 'errors.generic',
        variable: '{{action}}',
      })
    );
  });

  it('warns when translation exceeds 150% of source length', () => {
    // 'Save action' = 11 chars. 18 chars = 164% → warn (>150% but <200%).
    const translated = {
      common: { save: 'S'.repeat(18), cancel: 'Abbrechen' },
      errors: { generic: 'Fehler. {{action}}.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'length_warning', key: 'common.save' })
    );
  });

  it('flags glossary violation when translated string omits the locked term', () => {
    const glossarySource = { home: { streak: 'Your streak is on!' } };
    const glossaryTranslated = { home: { streak: '¡Tu serie está activa!' } };
    const glossary = { streak: { es: 'racha' } };
    const result = validateTranslation(
      glossarySource,
      glossaryTranslated,
      'es',
      glossary
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        type: 'glossary_violation',
        key: 'home.streak',
      })
    );
  });

  it('passes when translated string contains the glossary-locked term', () => {
    const glossarySource = { home: { streak: 'Your streak is on!' } };
    const glossaryTranslated = { home: { streak: '¡Tu racha está activa!' } };
    const glossary = { streak: { es: 'racha' } };
    const result = validateTranslation(
      glossarySource,
      glossaryTranslated,
      'es',
      glossary
    );
    expect(result.valid).toBe(true);
  });

  it('hard-fails when translation exceeds 200% of source length', () => {
    // 'Save action' = 11 chars. 30 chars = 273% → fail.
    const translated = {
      common: { save: 'S'.repeat(30), cancel: 'Abbrechen' },
      errors: { generic: 'Fehler. {{action}}.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'length_exceeded', key: 'common.save' })
    );
  });
});

describe('computeChangedKeys', () => {
  it('returns all keys when previous is null', () => {
    const current = { common: { save: 'Save', cancel: 'Cancel' } };
    expect(computeChangedKeys(current, null)).toEqual([
      'common.save',
      'common.cancel',
    ]);
  });

  it('returns only changed and added keys', () => {
    const previous = { common: { save: 'Save', cancel: 'Cancel' } };
    const current = { common: { save: 'Save', cancel: 'Abort', done: 'Done' } };
    const changed = computeChangedKeys(current, previous);
    expect(changed).toContain('common.cancel');
    expect(changed).toContain('common.done');
    expect(changed).not.toContain('common.save');
  });

  it('returns removed keys', () => {
    const previous = { common: { save: 'Save', cancel: 'Cancel', old: 'Old' } };
    const current = { common: { save: 'Save', cancel: 'Cancel' } };
    const changed = computeChangedKeys(current, previous);
    expect(changed).toContain('common.old');
  });
});
