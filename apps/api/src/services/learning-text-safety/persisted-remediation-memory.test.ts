import { PgDialect } from 'drizzle-orm/pg-core';

import {
  memoryFactActiveGroupKey,
  memoryFactCasGuard,
} from './persisted-remediation-memory';

describe('memoryFactActiveGroupKey [WI-3078]', () => {
  const baseRow = {
    profileId: 'profile-1',
    category: 'strength',
    textNormalized: 'same normalized text',
  };

  it('keeps concatenation-colliding subject/context tuples distinct', () => {
    expect(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: 'Math', context: '' },
      }),
    ).not.toBe(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: 'Mat', context: 'h' },
      }),
    );
  });

  it('groups genuinely equal database tuples', () => {
    expect(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: 'Math', context: 'school' },
      }),
    ).toBe(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: 'Math', context: 'school' },
      }),
    );
  });

  it('keeps delimiter-like values unambiguous', () => {
    expect(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: 'Math\u001fadvanced', context: 'school' },
      }),
    ).not.toBe(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: 'Math', context: 'advanced\u001fschool' },
      }),
    );
  });

  it('keeps distinct normalized texts in distinct index tuples', () => {
    expect(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: 'Math', context: 'school' },
      }),
    ).not.toBe(
      memoryFactActiveGroupKey({
        ...baseRow,
        textNormalized: 'different normalized text',
        metadata: { subject: 'Math', context: 'school' },
      }),
    );
  });

  it('matches the index COALESCE semantics for null, missing, and empty values', () => {
    const empty = memoryFactActiveGroupKey({
      ...baseRow,
      metadata: { subject: '', context: '' },
    });

    expect(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: null, context: null },
      }),
    ).toBe(empty);
    expect(memoryFactActiveGroupKey({ ...baseRow, metadata: {} })).toBe(empty);
  });

  it('matches PostgreSQL text extraction for numeric and boolean scalars', () => {
    const missing = memoryFactActiveGroupKey({ ...baseRow, metadata: {} });
    const numeric = memoryFactActiveGroupKey({
      ...baseRow,
      metadata: { subject: 3 },
    });
    const boolean = memoryFactActiveGroupKey({
      ...baseRow,
      metadata: { subject: true },
    });

    expect(numeric).not.toBe(missing);
    expect(boolean).not.toBe(missing);
    expect(numeric).not.toBe(boolean);
    expect(numeric).toBe(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: '3' },
      }),
    );
    expect(boolean).toBe(
      memoryFactActiveGroupKey({
        ...baseRow,
        metadata: { subject: 'true' },
      }),
    );
  });
});

describe('memoryFactCasGuard [WI-3076]', () => {
  it('requires the original JSONB metadata as well as id and text', () => {
    const metadata = { subject: 'El alumno tiene TEA.', topics: [] };

    const rendered = new PgDialect().sqlToQuery(
      memoryFactCasGuard({
        id: 'fact-1',
        text: 'ordinary text',
        metadata,
      }),
    );

    expect(rendered.sql).toMatch(/"memory_facts"\."id"\s*=\s*\$\d+/);
    expect(rendered.sql).toMatch(/"memory_facts"\."text"\s*=\s*\$\d+/);
    expect(rendered.sql).toMatch(/"memory_facts"\."metadata"\s*=\s*\$\d+/);
    expect(rendered.params).toEqual(
      expect.arrayContaining([
        'fact-1',
        'ordinary text',
        JSON.stringify(metadata),
      ]),
    );
  });
});
