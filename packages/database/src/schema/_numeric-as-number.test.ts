import {
  numericAsNumber,
  parseNumericFromDriver,
} from './_numeric-as-number.js';

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

// ---------------------------------------------------------------------------
// [BUG-980 / CCR-PR126-M-3] NaN guard on the driver→number coercion.
//
// `Number('abc')` silently returns NaN. Columns using this type back SRS
// scheduling math (mastery_score, ease_factor); a NaN propagating into those
// calculations corrupts review intervals invisibly. Pre-fix the function
// returned NaN with no error or log entry — Sentry never saw it.
// ---------------------------------------------------------------------------

describe('parseNumericFromDriver — NaN guard [BUG-980]', () => {
  it('parses a well-formed numeric string', () => {
    expect(parseNumericFromDriver('0.85', 'mastery_score')).toBe(0.85);
    expect(parseNumericFromDriver('2.5', 'ease_factor')).toBe(2.5);
    expect(parseNumericFromDriver('0', 'mastery_score')).toBe(0);
  });

  it('parses negative and large numbers within safe range', () => {
    expect(parseNumericFromDriver('-1.23', 'col')).toBe(-1.23);
    expect(parseNumericFromDriver('1000000', 'col')).toBe(1_000_000);
  });

  it('[BREAK] throws on a non-numeric corrupt value instead of returning NaN', () => {
    expect(() =>
      parseNumericFromDriver('not-a-number', 'mastery_score')
    ).toThrow(/corrupt value "not-a-number" for column "mastery_score"/);
  });

  it('[BREAK] throws on Infinity-producing strings', () => {
    expect(() => parseNumericFromDriver('Infinity', 'ease_factor')).toThrow(
      /corrupt value/
    );
    expect(() => parseNumericFromDriver('-Infinity', 'ease_factor')).toThrow(
      /corrupt value/
    );
  });

  it('[BREAK] throws on null instead of silently coercing to 0', () => {
    // Number(null) === 0 and Number.isFinite(0) === true, so without an
    // explicit null guard a null driver value would silently round to 0 and
    // pass validation. Today's columns are notNull(), but a future nullable
    // numeric column would corrupt data invisibly through this helper.
    expect(() =>
      parseNumericFromDriver(null as unknown as string, 'mastery_score')
    ).toThrow(/null.*for column "mastery_score"/);
  });

  it('[BREAK] throws on undefined for the same reason', () => {
    expect(() =>
      parseNumericFromDriver(undefined as unknown as string, 'ease_factor')
    ).toThrow(/undefined.*for column "ease_factor"/);
  });

  it('[BREAK] throws on empty / whitespace strings instead of coercing to 0', () => {
    // Number('') === 0 and Number(' \t\n') === 0 — both pass isFinite, so
    // without the explicit whitespace guard a malformed driver value would
    // silently round to 0 and corrupt SRS scheduling math the same way the
    // null case did. Pin the boundary so a future refactor can't regress it.
    for (const blank of ['', ' ', '\t', '\n', '   \t\n']) {
      expect(() => parseNumericFromDriver(blank, 'mastery_score')).toThrow(
        /empty\/whitespace string for column "mastery_score"/
      );
    }
  });

  it('[BREAK] error message includes the column name for triage', () => {
    try {
      parseNumericFromDriver('xyz', 'ease_factor');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toContain('ease_factor');
      expect((err as Error).message).toContain('"xyz"');
    }
  });

  it('[BREAK] customType fromDriver hook surfaces the same throw', () => {
    const col = numericAsNumber('mastery_score', { precision: 3, scale: 2 });
    const builder: any = col;
    const fromDriver = builder.config.customTypeParams.fromDriver as (
      v: string
    ) => number;
    expect(() => fromDriver('garbage')).toThrow(/corrupt value/);
  });
});
