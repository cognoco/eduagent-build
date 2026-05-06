import { sql } from 'drizzle-orm';

import { memoryFacts, type Database } from '@eduagent/database';

type CascadeDeleteDb = Pick<Database, 'execute'>;

export interface CascadeDeleteArgs {
  emit: (
    name: string,
    payload: Record<string, unknown>
  ) => void | Promise<void>;
}

export async function cascadeDeleteFactWithAncestry(
  db: CascadeDeleteDb,
  profileId: string,
  factId: string,
  args: CascadeDeleteArgs
): Promise<{ deletedIds: string[] }> {
  const result = await db.execute(sql`
    WITH RECURSIVE ancestry(id) AS (
      SELECT id FROM ${memoryFacts}
        WHERE id = ${factId} AND profile_id = ${profileId}
      UNION
      SELECT m.id FROM ${memoryFacts} m
        INNER JOIN ancestry a ON m.superseded_by = a.id
        WHERE m.profile_id = ${profileId}
    )
    DELETE FROM ${memoryFacts}
      WHERE profile_id = ${profileId}
        AND id IN (SELECT id FROM ancestry)
      RETURNING id
  `);

  const deletedIds =
    (result as unknown as { rows?: { id: string }[] }).rows?.map(
      (row) => row.id
    ) ?? [];
  await args.emit('memory.fact.deleted', { profileId, deletedIds });
  return { deletedIds };
}
