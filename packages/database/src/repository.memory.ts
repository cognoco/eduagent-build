import { and, asc, sql, type SQL } from 'drizzle-orm';
import type { Database } from './client';
import { VECTOR_DIM } from './schema/_pgvector';
import { memoryFacts, type MemoryFactRow } from './schema/index';
import type { ScopedWhere } from './repository._shared';

/**
 * Memory-facts namespace of the profile-scoped repository
 * (extracted from repository.ts, WI-1089). Behavior unchanged.
 */
export function createMemoryRepository(
  db: Database,
  profileId: string,
  scopedWhere: ScopedWhere,
) {
  return {
    memoryFacts: {
      async findManyActive(extraWhere?: SQL) {
        return db.query.memoryFacts.findMany({
          where: scopedWhere(
            memoryFacts,
            extraWhere
              ? and(sql`${memoryFacts.supersededBy} IS NULL`, extraWhere)
              : sql`${memoryFacts.supersededBy} IS NULL`,
          ),
          orderBy: [asc(memoryFacts.createdAt), asc(memoryFacts.id)],
        });
      },
      async findFirstActive(extraWhere?: SQL) {
        return db.query.memoryFacts.findFirst({
          where: scopedWhere(
            memoryFacts,
            extraWhere
              ? and(sql`${memoryFacts.supersededBy} IS NULL`, extraWhere)
              : sql`${memoryFacts.supersededBy} IS NULL`,
          ),
          orderBy: [asc(memoryFacts.createdAt), asc(memoryFacts.id)],
        });
      },
      async findActiveCandidatesWithEmbedding() {
        return db.query.memoryFacts.findMany({
          where: scopedWhere(
            memoryFacts,
            and(
              sql`${memoryFacts.supersededBy} IS NULL`,
              sql`${memoryFacts.embedding} IS NOT NULL`,
              sql`${memoryFacts.category} <> 'suppressed'`,
            ),
          ),
          orderBy: [asc(memoryFacts.createdAt), asc(memoryFacts.id)],
        });
      },
      async findCascadeAncestry(factId: string): Promise<MemoryFactRow[]> {
        // CR-2026-05-21-168: The recursive arm previously used raw snake_case
        // string literals (`m.superseded_by`, `m.profile_id`). These strings
        // survive column renames silently — drizzle's typed sites get a compile
        // error but the raw string would return wrong/empty rows at runtime.
        //
        // Fix: derive column names from the typed drizzle schema at runtime via
        // `.name` — if a future migration renames the column, the schema is
        // updated in one place and this CTE also picks up the new name.
        // `${memoryFacts.X}` cannot be used directly in the recursive arm
        // because drizzle expands it to `"table_name"."col"` (table-qualified),
        // which is invalid SQL when the table is aliased as `m`.
        // `sql.raw(memoryFacts.X.name)` emits the bare column name only.
        //
        // The return type is pinned to `MemoryFactRow[]` (derived from
        // `typeof memoryFacts.$inferSelect`) so callers receive a typed array
        // without a runtime dependency. This follows the same idiom as other
        // raw-query methods in this file that cast `result.rows`.
        const result = await db.execute(sql`
          WITH RECURSIVE ancestry AS (
            SELECT * FROM ${memoryFacts}
              WHERE ${memoryFacts.id} = ${factId}
                AND ${memoryFacts.profileId} = ${profileId}
            UNION
            SELECT m.* FROM ${memoryFacts} m
              INNER JOIN ancestry a ON m.${sql.raw(memoryFacts.supersededBy.name)} = a.id
              WHERE m.${sql.raw(memoryFacts.profileId.name)} = ${profileId}
          )
          SELECT * FROM ancestry
        `);
        return result.rows as MemoryFactRow[];
      },
      async findRelevant(
        queryEmbedding: number[],
        k: number,
        extraWhere?: SQL,
      ) {
        if (
          queryEmbedding.length !== VECTOR_DIM ||
          queryEmbedding.some((value) => !Number.isFinite(value)) ||
          k <= 0
        ) {
          return [];
        }

        const overFetch = k * 4;
        const queryLiteral = sql`${`[${queryEmbedding.join(',')}]`}::vector`;
        const defaultFilters = and(
          sql`${memoryFacts.supersededBy} IS NULL`,
          sql`${memoryFacts.category} <> 'suppressed'`,
        );
        const baseWhere = scopedWhere(
          memoryFacts,
          extraWhere ? and(defaultFilters, extraWhere) : defaultFilters,
        );

        return db
          .select({
            id: memoryFacts.id,
            profileId: memoryFacts.profileId,
            category: memoryFacts.category,
            text: memoryFacts.text,
            textNormalized: memoryFacts.textNormalized,
            metadata: memoryFacts.metadata,
            sourceSessionIds: memoryFacts.sourceSessionIds,
            sourceEventIds: memoryFacts.sourceEventIds,
            observedAt: memoryFacts.observedAt,
            confidence: memoryFacts.confidence,
            createdAt: memoryFacts.createdAt,
            distance: sql<number>`${memoryFacts.embedding} <=> ${queryLiteral}`,
          })
          .from(memoryFacts)
          .where(and(baseWhere, sql`${memoryFacts.embedding} IS NOT NULL`))
          .orderBy(sql`${memoryFacts.embedding} <=> ${queryLiteral}`)
          .limit(overFetch);
      },
    },
  };
}
