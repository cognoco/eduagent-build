import { numericAsNumber } from './_numeric-as-number.js';

/**
 * BUG-641 [P-1]: regression tests for the numericAsNumber custom column type.
 *
 * The point of this helper is that consumers see `number` everywhere — not
 * `string` — so callers don't need to remember `Number(row.field)` at every
 * read site. These tests pin both the SQL DDL emitted into migrations and
 * the runtime conversion behaviour.
 */
describe('numericAsNumber', () => {
  it('emits the expected SQL DDL for a numeric column', () => {
    const col = numericAsNumber('mastery_score', { precision: 3, scale: 2 });
    // The column object exposes its config via the build chain — pull the
    // SQL type from the dataType() function defined in customType.

    const builder: any = col;
    const sqlName: string = builder.config.customTypeParams.dataType();
    expect(sqlName).toBe('numeric(3, 2)');
  });

  it('converts string driver values to number on read', () => {
    const col = numericAsNumber('ease_factor', { precision: 4, scale: 2 });

    const builder: any = col;
    const fromDriver = builder.config.customTypeParams.fromDriver as (
      v: string
    ) => number;
    expect(fromDriver('2.50')).toBe(2.5);
    expect(fromDriver('1.30')).toBe(1.3);
    expect(fromDriver('9.99')).toBe(9.99);
  });

  it('converts number values to string for the driver on write', () => {
    const col = numericAsNumber('ease_factor', { precision: 4, scale: 2 });

    const builder: any = col;
    const toDriver = builder.config.customTypeParams.toDriver as (
      v: number
    ) => string;
    expect(toDriver(2.5)).toBe('2.5');
    expect(toDriver(1.3)).toBe('1.3');
  });

  it('round-trips numeric values without precision loss in our supported range', () => {
    const col = numericAsNumber('mastery_score', { precision: 3, scale: 2 });

    const builder: any = col;
    const fromDriver = builder.config.customTypeParams.fromDriver as (
      v: string
    ) => number;
    const toDriver = builder.config.customTypeParams.toDriver as (
      v: number
    ) => string;

    // Mastery 0..1 (precision 3, scale 2) and ease 1.30..9.99 (precision 4,
    // scale 2) are well within IEEE-754 double precision — every value
    // round-trips bit-exact through the customType.
    for (const value of [0, 0.25, 0.5, 0.75, 1.0, 2.5, 1.3, 9.99]) {
      expect(fromDriver(toDriver(value))).toBe(value);
    }
  });
});
