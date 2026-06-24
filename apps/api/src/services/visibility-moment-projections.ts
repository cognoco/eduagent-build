import { and, desc, eq } from 'drizzle-orm';

import {
  supportVisibilityNotices,
  type Database,
  type NewSupportVisibilityNotice,
} from '@eduagent/database';
import {
  visibilityMomentPayloadSchema,
  type RenderAudience,
  type VisibilityMoment,
} from '@eduagent/schemas';

export async function createVisibilityNotice(
  db: Database,
  input: Omit<NewSupportVisibilityNotice, 'id' | 'createdAt'> & {
    createdAt?: Date;
  },
): Promise<VisibilityMoment> {
  const rows = await db
    .insert(supportVisibilityNotices)
    .values(input)
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Visibility notice insert returned no row');
  return mapNotice(row);
}

export async function deriveVisibilityMoments(
  db: Database,
  input: {
    targetPersonId: string;
    targetAudience: RenderAudience;
    limit?: number;
  },
): Promise<VisibilityMoment[]> {
  const rows = await db
    .select()
    .from(supportVisibilityNotices)
    .where(
      and(
        eq(supportVisibilityNotices.targetPersonId, input.targetPersonId),
        eq(supportVisibilityNotices.targetAudience, input.targetAudience),
      ),
    )
    .orderBy(desc(supportVisibilityNotices.createdAt))
    .limit(input.limit ?? 20);

  return rows.map(mapNotice);
}

function mapNotice(
  row: typeof supportVisibilityNotices.$inferSelect,
): VisibilityMoment {
  return {
    id: row.id,
    type: row.noticeType as VisibilityMoment['type'],
    supportershipId: row.supportershipId,
    targetAudience: row.targetAudience as RenderAudience,
    targetPersonId: row.targetPersonId,
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    payload: visibilityMomentPayloadSchema.parse(row.payload),
  };
}
