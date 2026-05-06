import { and, eq, isNull } from 'drizzle-orm';

import { pendingNotices, type Database } from '@eduagent/database';
import type { PendingNotice, PendingNoticeType } from '@eduagent/schemas';

interface PendingNoticePayload {
  childName: string;
}

function parsePayload(payload: unknown): PendingNoticePayload {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    typeof (payload as { childName?: unknown }).childName === 'string'
  ) {
    return { childName: (payload as { childName: string }).childName };
  }
  return { childName: 'Your child' };
}

export async function recordPendingNotice(
  db: Database,
  input: {
    ownerProfileId: string;
    type: PendingNoticeType;
    childName: string;
  }
): Promise<void> {
  await db.insert(pendingNotices).values({
    ownerProfileId: input.ownerProfileId,
    type: input.type,
    payloadJson: { childName: input.childName },
  });
}

export async function listPendingNotices(
  db: Database,
  ownerProfileId: string
): Promise<PendingNotice[]> {
  const rows = await db.query.pendingNotices.findMany({
    where: and(
      eq(pendingNotices.ownerProfileId, ownerProfileId),
      isNull(pendingNotices.seenAt)
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  return rows.map((row) => ({
    id: row.id,
    type:
      row.type === 'consent_deleted' || row.type === 'consent_archived'
        ? row.type
        : 'consent_deleted',
    payload: parsePayload(row.payloadJson),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function markPendingNoticeSeen(
  db: Database,
  ownerProfileId: string,
  noticeId: string
): Promise<void> {
  await db
    .update(pendingNotices)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(pendingNotices.id, noticeId),
        eq(pendingNotices.ownerProfileId, ownerProfileId),
        isNull(pendingNotices.seenAt)
      )
    );
}
