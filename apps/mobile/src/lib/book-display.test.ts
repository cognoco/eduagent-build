import { displayBookDescription } from './book-display';

describe('displayBookDescription', () => {
  it('returns null for an empty, whitespace, or missing description', () => {
    expect(displayBookDescription('The Middle Ages', '')).toBeNull();
    expect(displayBookDescription('The Middle Ages', '   ')).toBeNull();
    expect(displayBookDescription('The Middle Ages', null)).toBeNull();
    expect(displayBookDescription('The Middle Ages', undefined)).toBeNull();
  });

  it('suppresses a description that merely echoes the title', () => {
    expect(
      displayBookDescription('The Middle Ages', 'The Middle Ages'),
    ).toBeNull();
    expect(
      displayBookDescription('The Middle Ages', '  the middle ages '),
    ).toBeNull();
  });

  it('suppresses the "Learn about <title>" filing-fallback echo', () => {
    expect(
      displayBookDescription('The Middle Ages', 'Learn about The Middle Ages'),
    ).toBeNull();
    expect(
      displayBookDescription('The Middle Ages', 'learn about the middle ages'),
    ).toBeNull();
  });

  it('keeps a genuinely informative description', () => {
    const desc =
      'An exploration of the events, key figures, and impacts of global exploration.';
    expect(displayBookDescription('Global Exploration', desc)).toBe(desc);
  });

  it('trims surrounding whitespace on kept descriptions', () => {
    expect(displayBookDescription('X', '  real summary ')).toBe('real summary');
  });
});
