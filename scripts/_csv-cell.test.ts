/**
 * [WI-324 / DS-235] CSV formula-injection neutralization for the
 * mock-cleanup inventory generator.
 *
 * The script extracts string-literal jest/vi mock targets from repo test
 * files and writes them straight into a committed CSV. `target` is
 * attacker-controlled in the limited sense that a contributor could land a
 * test file whose `jest.mock('=cmd|"/c calc"!A1', ...)` arg is inert
 * TypeScript but, after CSV emission, becomes an active spreadsheet formula
 * when a maintainer opens the file in Excel or Google Sheets. The
 * historical csvCell() only handled `,"\r\n` quoting; it did not neutralize
 * leading `=`, `+`, `-`, `@`, `\t`, or `\r`.
 *
 * Prefix a single quote to any value that begins with a dangerous character
 * (OWASP CSV-injection guidance) before the existing quoting layer runs.
 */
// Imports the extracted helper module directly. The parent script
// (generate-internal-mock-cleanup-inventory.ts) is ESM and would force a
// loader change to test under ts-jest; the helper is intentionally
// loader-neutral so this test runs under the existing scripts/jest config.
import { csvCell } from './_csv-cell';

describe('csvCell — formula-injection neutralization [WI-324]', () => {
  it('passes safe strings through unchanged', () => {
    expect(csvCell('hello world')).toBe('hello world');
    expect(csvCell('app/foo.test.ts')).toBe('app/foo.test.ts');
    expect(csvCell('')).toBe('');
    expect(csvCell('123')).toBe('123');
  });

  it('still applies CSV quoting for commas, double-quotes, CR, and LF', () => {
    // Regression-preserves the pre-existing quoting behaviour.
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it.each([
    // Inputs whose only dangerous content is the leading formula character —
    // no embedded `,"\r\n`, so the quoting layer does not trigger after
    // neutralization and the result is just the single-quote-prefixed value.
    ['+1+2', "'+1+2"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['=SUM(A1:A10)', "'=SUM(A1:A10)"],
  ])(
    '[BREAK] prefixes leading formula character (%s) with a single quote',
    (input, expectedPrefixed) => {
      expect(csvCell(input)).toBe(expectedPrefixed);
    },
  );

  it('[BREAK] neutralizes a leading TAB without forcing the comma/quote wrapper', () => {
    // TAB is in the neutralize set (`^[=+\-@\t\r]`) but NOT in the quoting
    // regex (`[",\r\n]`), so a `\t=...` value gets the single-quote prefix
    // but is not wrapped.
    expect(csvCell('\t=BAD()')).toBe("'\t=BAD()");
  });

  it('[BREAK] neutralizes a leading CR AND triggers the comma/CRLF wrapper', () => {
    // CR is in both sets, so a `\r=...` value gets the single-quote prefix
    // AND is wrapped by the existing comma/CRLF quoting layer.
    expect(csvCell('\r=BAD()')).toBe('"\'\r=BAD()"');
  });

  it('[BREAK] neutralizes a leading `=` that arrives with embedded quotes (formula + CSV quote escaping together)', () => {
    // The `=cmd|"/c calc"!A1` payload from the WI brief: the formula char
    // gets the single-quote prefix; the embedded `"`s force the CSV
    // quote-wrap and escape-double-up; both layers compose in order.
    expect(csvCell('=cmd|"/c calc"!A1')).toBe('"\'=cmd|""/c calc""!A1"');
  });

  it('[BREAK] neutralizes AND quotes when the dangerous value also contains commas/quotes', () => {
    // Formula + quoted-cell value — both neutralization and the
    // comma/quote-escaping layer must apply, in that order. The leading
    // single-quote becomes part of the cell content, the surrounding "..."
    // is the CSV literal delimiter, and any embedded `"` is doubled.
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""x"")"',
    );
    expect(csvCell('+CMD,injection')).toBe('"\'+CMD,injection"');
  });

  it('does not neutralize a `-` or `+` that appears mid-string (only leading)', () => {
    // Mid-string formula characters are not interpreted as formulas by
    // spreadsheets — only the leading character matters. Avoid over-quoting
    // ordinary content like negative numbers in non-leading positions.
    expect(csvCell('foo-bar')).toBe('foo-bar');
    expect(csvCell('a+b')).toBe('a+b');
    expect(csvCell('alice@example.com')).toBe('alice@example.com');
  });
});
