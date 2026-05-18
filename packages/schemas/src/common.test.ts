import {
  isoDateField,
  isoDateSchema,
  uuidSchema,
  paginationSchema,
} from './common.js';

describe('common schemas', () => {
  describe('isoDateField (BUG-205 hoist)', () => {
    it('accepts an ISO 8601 datetime string and returns it unchanged', () => {
      const iso = '2026-05-18T12:34:56.000Z';
      expect(isoDateField.parse(iso)).toBe(iso);
    });

    it('accepts a JS Date and normalises it to an ISO string', () => {
      const date = new Date('2026-05-18T12:34:56.000Z');
      const parsed = isoDateField.parse(date);
      expect(typeof parsed).toBe('string');
      expect(parsed).toBe('2026-05-18T12:34:56.000Z');
    });

    it('rejects a non-ISO string', () => {
      expect(isoDateField.safeParse('not-a-date').success).toBe(false);
      expect(isoDateField.safeParse('2026-13-99').success).toBe(false);
    });

    it('rejects null and undefined (use .nullable()/.optional() at the call site)', () => {
      expect(isoDateField.safeParse(null).success).toBe(false);
      expect(isoDateField.safeParse(undefined).success).toBe(false);
    });
  });

  describe('isoDateSchema (calendar date)', () => {
    it('accepts YYYY-MM-DD', () => {
      expect(isoDateSchema.parse('2026-05-18')).toBe('2026-05-18');
    });

    it('rejects a full datetime', () => {
      expect(isoDateSchema.safeParse('2026-05-18T00:00:00Z').success).toBe(
        false,
      );
    });
  });

  describe('uuidSchema', () => {
    it('accepts a valid UUID', () => {
      expect(uuidSchema.parse('550e8400-e29b-41d4-a716-446655440000')).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('rejects a non-UUID string', () => {
      expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('defaults limit to 20 when omitted', () => {
      const parsed = paginationSchema.parse({});
      expect(parsed.limit).toBe(20);
    });

    it('rejects limit out of range', () => {
      expect(paginationSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
    });
  });
});
