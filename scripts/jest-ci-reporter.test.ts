// [BUG-323] Break test for gaEscape — GitHub Actions annotation syntax is
//   ::error key=value,key=value::message
// so any literal `=` inside a key/value (e.g. a Jest test title that mentions
// "result === 42", or a file path containing `=`) terminates the preceding
// key boundary and corrupts the annotation. gaEscape must percent-encode `=`
// in addition to `%`, `\r`, `\n`, `:`, and `,`.
//
// Red-green pattern: removing the `.replace(/=/g, '%3D')` line in
// scripts/jest-ci-reporter.cjs must turn this suite RED. With the fix in
// place it must be GREEN.

const { gaEscape } = require('./jest-ci-reporter.cjs') as {
  gaEscape: (s: string) => string;
};

describe('[BUG-323] gaEscape percent-encodes annotation-delimiter characters', () => {
  it('percent-encodes "=" so it cannot terminate a key boundary', () => {
    expect(gaEscape('a=b')).toBe('a%3Db');
  });

  it('percent-encodes "," so it cannot end the key=value list', () => {
    expect(gaEscape('a,b')).toBe('a%2Cb');
  });

  it('percent-encodes ":" so it cannot start the annotation message body', () => {
    expect(gaEscape('a:b')).toBe('a%3Ab');
  });

  it('percent-encodes CR + LF so multi-line messages stay on one line', () => {
    expect(gaEscape('line1\r\nline2')).toBe('line1%0D%0Aline2');
  });

  it('escapes "%" first so its own escape sequences are not double-encoded', () => {
    expect(gaEscape('100%')).toBe('100%25');
    // If `%` were not encoded first, `=` would be replaced with `%3D`, then
    // that literal `%` would be re-encoded to `%253D`. Verify the canonical
    // ordering still yields a clean `%3D`.
    expect(gaEscape('x=%')).toBe('x%3D%25');
  });

  it('handles a realistic Jest title containing "===" without corrupting the boundary', () => {
    // A title like `expect(result === 42).toBe(true)` would emit
    //   ::error file=...,title=expect(result === 42).toBe(true)::...
    // The literal `=` after `result ` would parse as a new key boundary.
    // After escaping, no raw `=` survives.
    const escaped = gaEscape('expect(result === 42).toBe(true)');
    expect(escaped).not.toMatch(/=/);
    expect(escaped).toContain('%3D');
  });

  it('coerces non-string input via String()', () => {
    expect(gaEscape(42 as unknown as string)).toBe('42');
    expect(gaEscape(null as unknown as string)).toBe('null');
  });
});
