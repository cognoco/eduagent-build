import { checkStaleness } from './check-i18n-staleness';

describe('checkStaleness', () => {
  const source = {
    common: { save: 'Save', cancel: 'Cancel' },
    errors: { generic: 'Error. {{action}} to retry.' },
  };

  it('passes when all target files have matching keys and variables', () => {
    const targets = {
      de: {
        common: { save: 'Speichern', cancel: 'Abbrechen' },
        errors: { generic: 'Fehler. {{action}} zum Wiederholen.' },
      },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when target is missing a key', () => {
    const targets = {
      de: {
        common: { save: 'Speichern' },
        errors: { generic: 'Fehler. {{action}}.' },
      },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        lang: 'de',
        type: 'missing_key',
        key: 'common.cancel',
      })
    );
  });

  it('fails when target has orphaned keys', () => {
    const targets = {
      de: {
        common: { save: 'Speichern', cancel: 'Abbrechen', orphan: 'Waise' },
        errors: { generic: 'Fehler. {{action}}.' },
      },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        lang: 'de',
        type: 'orphaned_key',
        key: 'common.orphan',
      })
    );
  });

  it('fails when target is missing an interpolation variable', () => {
    const targets = {
      de: {
        common: { save: 'Speichern', cancel: 'Abbrechen' },
        errors: { generic: 'Fehler.' },
      },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        lang: 'de',
        type: 'missing_variable',
        key: 'errors.generic',
        variable: '{{action}}',
      })
    );
  });

  it('reports errors from multiple languages', () => {
    const targets = {
      de: {
        common: { save: 'Speichern' },
        errors: { generic: 'Fehler. {{action}}.' },
      },
      es: { common: { save: 'Guardar', cancel: 'Cancelar' }, errors: {} },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(false);
    const langs = result.errors.map((e) => e.lang);
    expect(langs).toContain('de');
    expect(langs).toContain('es');
  });
});
