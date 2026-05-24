/**
 * [WI-324 / DS-235] CSV cell escaping with formula-injection neutralization.
 *
 * Extracted from generate-internal-mock-cleanup-inventory.ts so this pure
 * helper can be unit-tested under the CommonJS ts-jest pipeline used by
 * scripts/jest.config.cjs without dragging in the parent script's ESM
 * `import.meta.url` initialization, which forces an ESM-only loader.
 *
 * Layered safety: prefix dangerous leading bytes (=, +, -, @, TAB, CR) with
 * a single quote per OWASP CSV-injection guidance BEFORE the existing
 * comma/quote/CRLF quoting layer runs. A value that begins with a formula
 * character is interpreted as a formula by Excel and Google Sheets when the
 * CSV is opened in a spreadsheet program. An attacker-controlled cell —
 * e.g. a contributed test file's `jest.mock('=cmd|"/c calc"!A1', ...)` —
 * is inert TypeScript but becomes an active formula post-emission.
 */
const CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const neutralized = CSV_FORMULA_LEAD.test(value) ? `'${value}` : value;
  if (!/[",\r\n]/.test(neutralized)) {
    return neutralized;
  }
  return `"${neutralized.replace(/"/g, '""')}"`;
}
