// Shared react-i18next mock for unit tests. Looks up keys against the real
// en.json so assertions reference rendered English text (what users see),
// not bare keys. A missing key returns the key string verbatim — same
// behavior as i18next at runtime, so a typo'd t('foo.barr') falls through
// to the literal 'foo.barr' and any assertion on rendered text fails loudly.
//
// Use via:
//   jest.mock('react-i18next', () => require('../../test-utils/mock-i18n').i18nMock);
import en from '../i18n/locales/en.json';

type Nested = { [k: string]: string | Nested };

function lookup(obj: Nested, key: string): string | undefined {
  const parts = key.split('.');
  let current: string | Nested | undefined = obj;
  for (const part of parts) {
    if (current === undefined) return undefined;
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Nested)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, opts?: Record<string, unknown>): string {
  if (!opts) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const value = opts[name];
    return value === undefined ? `{{${name}}}` : String(value);
  });
}

export function translate(key: string, opts?: Record<string, unknown>): string {
  const value = lookup(en as Nested, key);
  if (value === undefined) return key;
  return interpolate(value, opts);
}

export const i18nMock = {
  useTranslation: () => ({ t: translate }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
  Trans: ({ children }: { children?: unknown }) => children ?? null,
};
