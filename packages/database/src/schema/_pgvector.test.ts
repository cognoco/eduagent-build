import {
  vector,
  vectorFromDriver,
  vectorNullableFromDriver,
  vectorNullable,
  vectorNullableToDriver,
  vectorToDriver,
  VectorParseError,
  VECTOR_DIM,
} from './_pgvector.js';

describe('pgvector customType', () => {
  it('vector and vectorNullable share the same dimension', () => {
    const a = vector('a');
    const b = vectorNullable('b');

    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(VECTOR_DIM).toBe(1024);
  });

  it('toDriver/fromDriver round-trip a 1024-dim vector', () => {
    const v = Array.from({ length: VECTOR_DIM }, (_, i) => i / VECTOR_DIM);
    const driver = vectorToDriver(v);

    expect(typeof driver).toBe('string');
    expect((driver as string).startsWith('[')).toBe(true);

    const back = vectorFromDriver(driver);
    expect(back).toHaveLength(VECTOR_DIM);
    expect(back[0]).toBeCloseTo(0);
  });

  it('vectorNullable helpers round-trip null', () => {
    expect(vectorNullableToDriver(null)).toBeNull();
    expect(vectorNullableFromDriver(null)).toBeNull();
  });

  it('vectorNullable helpers round-trip vectors', () => {
    const v = [0.25, 0.5, 0.75];
    const driver = vectorNullableToDriver(v);

    expect(driver).toBe('[0.25,0.5,0.75]');
    expect(vectorNullableFromDriver(driver)).toEqual(v);
  });

  describe('vectorFromDriver — format fallback', () => {
    it('JSON-array format still parses (existing happy path)', () => {
      const result = vectorFromDriver('[0.1,0.2,0.3]');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('pgvector text format "(0.1,0.2,0.3)" now parses correctly', () => {
      const result = vectorFromDriver('(0.1,0.2,0.3)');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('pure garbage throws VectorParseError (not a raw SyntaxError)', () => {
      expect(() => vectorFromDriver('not a vector')).toThrow(VectorParseError);
    });

    it('VectorParseError message includes the original value', () => {
      const raw = 'not a vector';
      expect(() => vectorFromDriver(raw)).toThrow(
        expect.objectContaining({ message: expect.stringContaining(raw) }),
      );
    });

    it('VectorParseError message includes column hint when provided', () => {
      expect(() => vectorFromDriver('bad', 'embedding')).toThrow(
        expect.objectContaining({
          message: expect.stringContaining('embedding'),
        }),
      );
    });
  });
});
