import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';

import { pendingNotices, type Database } from '@eduagent/database';
import type { PendingNotice, PendingNoticeType } from '@eduagent/schemas';
import { createLogger } from './logger';

const logger = createLogger();

interface PendingNoticePayload {
  childName: string;
  sourceId?: string;
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

/**
 * Records a pending notice and returns its id. The id doubles as an opaque
 * reference for Inngest step state: consent-revocation memoizes the notice id
 * (never the child's name) and rehydrates the name from this first-party row
 * via `getPendingNoticeChildName` when composing the parent push.
 */
export async function recordPendingNotice(
  db: Database,
  input: {
    ownerProfileId: string;
    type: PendingNoticeType;
    childName: string;
    sourceId?: string;
    /** False prepares an invisible notice that must be activated after work succeeds. */
    ready?: boolean;
  },
): Promise<string> {
  const payloadJson: PendingNoticePayload = { childName: input.childName };
  if (input.sourceId) {
    payloadJson.sourceId = input.sourceId;
  }
  const [row] = await db
    .insert(pendingNotices)
    .values({
      ownerProfileId: input.ownerProfileId,
      type: input.type,
      payloadJson,
      readyAt: input.ready === false ? null : new Date(),
    })
    .onConflictDoNothing({
      target: [
        pendingNotices.ownerProfileId,
        pendingNotices.type,
        pendingNotices.payloadJson,
      ],
    })
    .returning({ id: pendingNotices.id });
  if (row) {
    return row.id;
  }

  const existing = await db.query.pendingNotices.findFirst({
    where: and(
      eq(pendingNotices.ownerProfileId, input.ownerProfileId),
      eq(pendingNotices.type, input.type),
      eq(pendingNotices.payloadJson, payloadJson),
    ),
    columns: { id: true },
  });
  if (!existing) {
    throw new Error('pending_notices insert conflict returned no row');
  }
  return existing.id;
}

/** Publish a prepared notice only after its irreversible work has completed. */
export async function activatePendingNotice(
  db: Database,
  ownerProfileId: string,
  noticeId: string,
): Promise<boolean> {
  const rows = await db
    .update(pendingNotices)
    .set({ readyAt: new Date() })
    .where(
      and(
        eq(pendingNotices.id, noticeId),
        eq(pendingNotices.ownerProfileId, ownerProfileId),
      ),
    )
    .returning({ id: pendingNotices.id });
  return rows.length > 0;
}

/**
 * Bound retention for child-name payloads prepared by a run that exhausted
 * retries before activation. Ready notices follow the normal seen/read path;
 * recent prepared notices remain available for live Inngest retries.
 */
export async function deleteStalePreparedNotices(
  db: Database,
): Promise<number> {
  // scope-allow: retention cleanup intentionally deletes stale hidden notices across profiles.
  const rows = await db
    .delete(pendingNotices)
    .where(
      and(
        isNull(pendingNotices.readyAt),
        lte(pendingNotices.createdAt, sql`now() - interval '7 days'`),
      ),
    )
    .returning({ id: pendingNotices.id });
  return rows.length;
}

/**
 * Rehydrates the child name captured in a pending notice. Used by deletion
 * flows where the profile row is already gone and the notice payload is the
 * only first-party copy of the name. Scoped by ownerProfileId (same shape as
 * markPendingNoticeSeen) so a leaked/forged notice id cannot read another
 * family's notice payload.
 */
export async function getPendingNoticeChildName(
  db: Database,
  ownerProfileId: string,
  noticeId: string,
): Promise<string | null> {
  const row = await db.query.pendingNotices.findFirst({
    where: and(
      eq(pendingNotices.id, noticeId),
      eq(pendingNotices.ownerProfileId, ownerProfileId),
    ),
    columns: { payloadJson: true },
  });
  return row ? parsePayload(row.payloadJson).childName : null;
}

/** Remove a prepared notice when its guarded deletion does not proceed. */
export async function deletePendingNotice(
  db: Database,
  ownerProfileId: string,
  noticeId: string,
): Promise<void> {
  await db
    .delete(pendingNotices)
    .where(
      and(
        eq(pendingNotices.id, noticeId),
        eq(pendingNotices.ownerProfileId, ownerProfileId),
      ),
    );
}

export async function listPendingNotices(
  db: Database,
  ownerProfileId: string,
): Promise<PendingNotice[]> {
  const rows = await db.query.pendingNotices.findMany({
    where: and(
      eq(pendingNotices.ownerProfileId, ownerProfileId),
      isNotNull(pendingNotices.readyAt),
      isNull(pendingNotices.seenAt),
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
  noticeId: string,
): Promise<boolean> {
  // Idempotent: no isNull(seenAt) filter so retries succeed even after the
  // server committed the UPDATE but the response was lost. IDOR protection is
  // preserved by the ownerProfileId match — wrong profile still returns 0.
  // Matches the idempotent shape of nudges.markNudgeRead.
  const rows = await db
    .update(pendingNotices)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(pendingNotices.id, noticeId),
        eq(pendingNotices.ownerProfileId, ownerProfileId),
      ),
    )
    .returning({ id: pendingNotices.id });
  return rows.length > 0;
}
