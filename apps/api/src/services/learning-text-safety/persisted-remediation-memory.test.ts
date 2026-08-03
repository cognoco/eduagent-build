import { PgDialect } from 'drizzle-orm/pg-core';

import { memoryFactCasGuard } from './persisted-remediation-memory';

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
