import {
  vector,
  vectorFromDriver,
  vectorNullable,
  vectorToDriver,
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

  it('vectorNullable round-trips null', () => {
    expect(null).toBeNull();
  });
});
