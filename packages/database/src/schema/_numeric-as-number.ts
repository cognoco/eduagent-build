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
export const numericAsNumber = (
  name: string,
  config: { precision: number; scale: number }
) =>
  customType<{ data: number; driverData: string }>({
    dataType() {
      return `numeric(${config.precision}, ${config.scale})`;
    },
    fromDriver(value: string): number {
      return Number(value);
    },
    toDriver(value: number): string {
      return String(value);
    },
  })(name);
