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

  // Tiny source strings (< 6 chars) skip the length check entirely:
  // "OK" → "D'accord" reads as 400% but is correct.
  it('skips length check for source strings shorter than 6 chars', () => {
    const tinySource = { common: { ok: 'OK' } };
    const tinyTranslated = { common: { ok: "D'accord" } };
    const result = validateTranslation(tinySource, tinyTranslated, 'fr');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  // Short 6–10 char sources have an absolute floor (sourceLen + 12).
  // "Skip" (4) wouldn't apply (<6); "Cancel" (6) → 18 chars allowed.
  it('allows short source strings to grow up to source+12 chars even past 200%', () => {
    const shortSource = { common: { cancel: 'Cancel' } }; // 6 chars
    // Norwegian "Avbryt handling" = 15 chars = 250% but ≤ 6+12=18 → OK
    const shortTranslated = { common: { cancel: 'Avbryt handling' } };
    const result = validateTranslation(shortSource, shortTranslated, 'nb');
    expect(result.errors).toHaveLength(0);
  });

  // Past the absolute floor, short sources DO fail.
  it('still rejects short source strings translated past source+12 chars', () => {
    const shortSource = { common: { cancel: 'Cancel' } }; // 6 chars; floor = 18
    // 25 chars > 18 floor AND > 200% ratio → fail
    const shortTranslated = { common: { cancel: 'A'.repeat(25) } };
    const result = validateTranslation(shortSource, shortTranslated, 'nb');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'length_exceeded', key: 'common.cancel' })
    );
  });

  // Stem matching: Polish nouns inflect by case (sesja → sesji/sesję/sesją).
  // Bare-substring check used to reject grammatically-correct Polish; stem
  // (4-letter prefix on diacritic-stripped form) accepts inflected forms.
  it('passes when Polish translation uses an inflected form of the locked term', () => {
    const src = { x: { y: 'No session today' } };
    const tgt = { x: { y: 'Brak sesji dzisiaj' } }; // sesji = genitive of sesja
    const glossary = { session: { pl: 'sesja' } };
    const result = validateTranslation(src, tgt, 'pl', glossary);
    expect(result.valid).toBe(true);
  });

  // Spanish sesión → sesiones (plural). Diacritic strip + stem "sesi"
  // matches both forms.
  it('passes when Spanish translation uses plural sesiones for source "session"', () => {
    const src = { x: { y: 'session count' } };
    const tgt = { x: { y: 'número de sesiones' } };
    const glossary = { session: { es: 'sesión' } };
    const result = validateTranslation(src, tgt, 'es', glossary);
    expect(result.valid).toBe(true);
  });

  // Portuguese sessão → sessões (plural shifts the diacritic). Stem "sess"
  // (on diacritic-stripped form) matches both.
  it('passes when Portuguese translation uses plural sessões for source "session"', () => {
    const src = { x: { y: 'session list' } };
    const tgt = { x: { y: 'lista de sessões' } };
    const glossary = { session: { pt: 'sessão' } };
    const result = validateTranslation(src, tgt, 'pt', glossary);
    expect(result.valid).toBe(true);
  });

  // Stem matching must still REJECT translations that share no stem with the
  // expected term — otherwise the check is useless.
  it('still rejects Polish translation that uses a wrong term entirely', () => {
    const src = { x: { y: 'session count' } };
    const tgt = { x: { y: 'liczba spotkań' } }; // "spotkanie" = meeting
    const glossary = { session: { pl: 'sesja' } };
    const result = validateTranslation(src, tgt, 'pl', glossary);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'glossary_violation', key: 'x.y' })
    );
  });

  // Short ASCII glossary stems (e.g. brand acronym 'XP') must match on word
  // boundaries, not substring. Pre-fix: glossaryStem('XP') → 'xp' and
  // 'expert'.includes('xp') === true, so any translation containing 'expert'
  // (or 'experience', 'expand') would falsely satisfy the lock. The brand
  // acronym preservation was effectively a no-op.
  it('[REGRESSION] rejects short-ASCII glossary stem matched as substring of unrelated word', () => {
    const src = { x: { y: 'You earned XP today' } };
    // Translation drops 'XP' entirely but happens to contain 'expert', which
    // .includes('xp') used to satisfy. Word-boundary match must reject this.
    const tgt = { x: { y: 'Heute hast du Expertenpunkte verdient' } };
    const glossary = { XP: { de: 'XP' } };
    const result = validateTranslation(src, tgt, 'de', glossary);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'glossary_violation', key: 'x.y' })
    );
  });

  it('[REGRESSION] still accepts short-ASCII glossary stem present as a standalone word', () => {
    const src = { x: { y: 'You earned XP today' } };
    const tgt = { x: { y: 'Heute hast du XP verdient' } };
    const glossary = { XP: { de: 'XP' } };
    const result = validateTranslation(src, tgt, 'de', glossary);
    expect(result.valid).toBe(true);
  });

  // Type drift: LLM returns a nested object where source has a string. After
  // flattening the target produces `common.save.label` while source has
  // `common.save`, so the validator reports both an extra_key and a missing_key.
  // Catches the "LLM hallucinated extra structure" failure mode.
  it('rejects type-drift where target deepens a leaf string into an object', () => {
    const src = { common: { save: 'Save action', cancel: 'Cancel button' } };
    const tgt = {
      common: {
        save: { label: 'Speichern' }, // type drift: object where string expected
        cancel: 'Abbrechen',
      },
    };
    const result = validateTranslation(src, tgt, 'de');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing_key', key: 'common.save' })
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'extra_key', key: 'common.save.label' })
    );
  });

  // Hallucinated interpolation variable: target adds {{var}} not in source.
  // Today the validator does not flag this (only missing variables fail), but
  // it surfaces as an extra_key check against any sister key — the test
  // documents current behaviour so a future tightening is intentional.
  it('does not raise missing_variable when target adds an unrelated {{var}}', () => {
    const src = {
      common: { save: 'Save action', cancel: 'Cancel button' },
      errors: { generic: 'Something went wrong. {{action}} to retry.' },
    };
    const tgt = {
      common: {
        save: 'Speichern {{hallucinated}}', // extra var; no source var to miss
        cancel: 'Abbrechen',
      },
      errors: { generic: 'Fehler. {{action}}.' },
    };
    const result = validateTranslation(src, tgt, 'de');
    // Source has no variables on common.save, so no missing_variable fires.
    expect(
      result.errors.filter((e) => e.type === 'missing_variable')
    ).toHaveLength(0);
    // Documented gap: extra variables in target are currently silent. If you
    // tighten validateTranslation to flag them, replace this assertion with
    // toContainEqual({ type: 'extra_variable', key: 'common.save', variable: '{{hallucinated}}' }).
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
