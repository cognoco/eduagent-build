import { customType } from 'drizzle-orm/pg-core';

/**
 * BUG-641 [P-1]: A drizzle column that stores `numeric(p, s)` in postgres but
 * exposes JavaScript `number` to TypeScript and at runtime — eliminating the
 * silent type lie where Zod schemas declared `z.number()` while drizzle
 * returned `string`, leaving every caller responsible for `Number(row.x)`.
 *
 * Safe for our use cases: mastery_score is 0..1 (precision 3, scale 2) and
 * ease_factor is 1.30..9.99 (precision 4, scale 2). Both are well within
 * the IEEE-754 double-precision range — no precision loss.
 *
 * Do NOT use this helper for arbitrary-precision financial columns: switch to
 * a different type if a column ever needs values whose mantissa exceeds 53
 * bits.
 */
/**
 * [BUG-980 / CCR-PR126-M-3] Strict driver-string → number coercion.
 *
 * Exported for unit testing. `Number('abc')` silently returns `NaN`; columns
 * using this type back SRS scheduling math (mastery_score, ease_factor), so a
 * NaN propagating into those calculations corrupts review intervals invisibly.
 * Throw with the column name and the offending value so Sentry captures it
 * and the operator can identify the row.
 */
// Parameter is widened to `string | null | undefined` (rather than `string`,
// which would match drizzle's `fromDriver` signature) so the runtime guards
// below are type-coherent and honestly document the defensive contract.
// Today's columns are notNull(), but a postgres driver can theoretically emit
// null despite the column metadata (driver bug, schema drift, hand-crafted
// row), and a future nullable numeric column would route through here too —
// without the widened type, a refactor that "tightens" the param to `string`
// could silently delete the guard. See callsite: customType.fromDriver below.
export function parseNumericFromDriver(
  value: string | null | undefined,
  columnName: string
): number {
  // Reject null/undefined explicitly. Number(null) === 0 and Number.isFinite(0)
  // is true, so without this guard a null driver value would silently coerce
  // to 0 and pass validation, corrupting SRS scheduling math invisibly.
  if (value === null || value === undefined) {
    throw new Error(
      `numericAsNumber: received ${value === null ? 'null' : 'undefined'} ` +
        `for column "${columnName}" — expected numeric string`
    );
  }
  // Same trap class as null: Number('') === 0 and Number(' \t\n') === 0, both
  // pass isFinite. Postgres numeric columns won't emit empty/whitespace today,
  // but a hand-crafted INSERT, a driver bug, or a future ETL path could —
  // and the silent coerce-to-zero would corrupt SRS scheduling math invisibly.
  if (typeof value === 'string' && value.trim() === '') {
    throw new Error(
      `numericAsNumber: received empty/whitespace string for column ` +
        `"${columnName}" — expected numeric string`
    );
  }
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new Error(
      `numericAsNumber: corrupt value ${JSON.stringify(
        value
      )} for column "${columnName}" — expected numeric string, got ${typeof value}`
    );
  }
  return result;
}

export const numericAsNumber = (
  name: string,
  config: { precision: number; scale: number }
) =>
  customType<{ data: number; driverData: string }>({
    dataType() {
      return `numeric(${config.precision}, ${config.scale})`;
    },
    fromDriver(value: string): number {
      return parseNumericFromDriver(value, name);
    },
    toDriver(value: number): string {
      return String(value);
    },
  })(name);
