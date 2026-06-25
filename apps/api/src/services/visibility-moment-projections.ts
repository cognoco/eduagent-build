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

import { captureException } from './sentry';

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
  const moment = mapNotice(row);
  if (!moment) {
    throw new Error(
      `Visibility notice payload failed validation after insert (id=${row.id})`,
    );
  }
  return moment;
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

  // Skip rows whose payload no longer matches the schema rather than failing
  // the whole read: one malformed historical row must not 500 every notice.
  return rows
    .map(mapNotice)
    .filter((moment): moment is VisibilityMoment => moment !== null);
}

function mapNotice(
  row: typeof supportVisibilityNotices.$inferSelect,
): VisibilityMoment | null {
  const parsed = visibilityMomentPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    captureException(parsed.error, {
      tags: { surface: 'visibility.payload_parse' },
      extra: { noticeId: row.id, noticeType: row.noticeType },
    });
    return null;
  }
  return {
    id: row.id,
    type: row.noticeType as VisibilityMoment['type'],
    supportershipId: row.supportershipId,
    targetAudience: row.targetAudience as RenderAudience,
    targetPersonId: row.targetPersonId,
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    payload: parsed.data,
  };
}
