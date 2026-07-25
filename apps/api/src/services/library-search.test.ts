import { PgDialect } from 'drizzle-orm/pg-core';
import type { Database } from '@eduagent/database';
import { searchLibrary } from './library-search';

describe('searchLibrary note isolation', () => {
  it('excludes server-owned Challenge evidence from generic note results', async () => {
    const capturedWhere: unknown[] = [];
    const db = {
      select: () => {
        const chain = {
          from: () => chain,
          innerJoin: () => chain,
          leftJoin: () => chain,
          where: (condition: unknown) => {
            capturedWhere.push(condition);
            return chain;
          },
          orderBy: () => chain,
          limit: async () => [],
        };
        return chain;
      },
    } as unknown as Database;

    await searchLibrary(db, 'profile-1', 'verified phrase');

    const dialect = new PgDialect();
    const notePredicate = capturedWhere
      .map((condition) => dialect.sqlToQuery(condition as never))
      .find(({ sql }) => sql.includes('"topic_notes"."content"'));

    expect(notePredicate?.sql).toMatch(
      /"topic_notes"\."artifact_source"\s+is\s+null/,
    );
    expect(notePredicate?.sql).toMatch(
      /"topic_notes"\."artifact_source"\s*=\s*\$\d+/,
    );
    expect(notePredicate?.params).toContain('learner_authored_note');
  });
});
