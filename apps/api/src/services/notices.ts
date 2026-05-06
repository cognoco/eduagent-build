import { and, eq, isNull } from 'drizzle-orm';

import { pendingNotices, type Database } from '@eduagent/database';
import type { PendingNotice, PendingNoticeType } from '@eduagent/schemas';
import { createLogger } from './logger';

const logger = createLogger();

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

  return rows.flatMap((row) => {
    if (row.type !== 'consent_deleted' && row.type !== 'consent_archived') {
      logger.warn('pending_notices.type unknown — row skipped', {
        noticeId: row.id,
        type: row.type,
      });
      return [];
    }
    const knownType: PendingNoticeType = row.type;
    return [
      {
        id: row.id,
        type: knownType,
        payload: parsePayload(row.payloadJson),
        createdAt: row.createdAt.toISOString(),
      } satisfies PendingNotice,
    ];
  });
}

export async function markPendingNoticeSeen(
  db: Database,
  ownerProfileId: string,
  noticeId: string
): Promise<boolean> {
  const rows = await db
    .update(pendingNotices)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(pendingNotices.id, noticeId),
        eq(pendingNotices.ownerProfileId, ownerProfileId),
        isNull(pendingNotices.seenAt)
      )
    )
    .returning({ id: pendingNotices.id });
  return rows.length > 0;
}
