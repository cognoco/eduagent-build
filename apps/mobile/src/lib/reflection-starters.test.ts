import { getReflectionStarters } from './reflection-starters';

describe('getReflectionStarters', () => {
  it('returns five learning starters in English by default', () => {
    expect(getReflectionStarersOrThrow('learning')).toHaveLength(5);
    expect(getReflectionStarersOrThrow('learning')[0]).toBe(
      'Today I learned that...'
    );
  });

  it('returns freeform starters in English', () => {
    expect(getReflectionStarersOrThrow('freeform', 'en')).toContain(
      'My question was about...'
    );
  });

  it('returns homework starters in Czech', () => {
    expect(getReflectionStarersOrThrow('homework', 'cs')).toContain(
      'Dnes jsem si procvicil/a...'
    );
  });

  it('falls back to English for unsupported languages', () => {
    expect(getReflectionStarersOrThrow('learning', 'de')[0]).toBe(
      'Today I learned that...'
    );
  });
});

function getReflectionStarersOrThrow(
  sessionType: Parameters<typeof getReflectionStarters>[0],
  language?: string | null
) {
  return getReflectionStarters(sessionType, language);
}
