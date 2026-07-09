import { and, eq, gt, inArray, isNotNull, lt } from 'drizzle-orm';
import {
  createScopedRepository,
  needsDeepeningTopics,
  type Database,
} from '@eduagent/database';

export type NeedsDeepeningPromotionSignal =
  | 'answer_struggle'
  | 'retention_again'
  | 'struggle_status';

export interface PromotePendingDeepeningResult {
  promotedCount: number;
  promotedIds: string[];
}

export interface ExpirePendingDeepeningRowsResult {
  expiredCount: number;
  expiredIds: string[];
}

export async function promotePendingDeepening(
  db: Database,
  profileId: string,
  topicId: string,
  _signal: NeedsDeepeningPromotionSignal,
): Promise<PromotePendingDeepeningResult> {
  const now = new Date();
  const repo = createScopedRepository(db, profileId);
  const pendingRows = await repo.needsDeepeningTopics.findMany(
    and(
      eq(needsDeepeningTopics.topicId, topicId),
      eq(needsDeepeningTopics.status, 'pending_review'),
      gt(needsDeepeningTopics.pendingExpiresAt, now),
    ),
  );

  const pendingIds = pendingRows
    .filter(
      (row) =>
        row.profileId === profileId &&
        row.topicId === topicId &&
        row.status === 'pending_review' &&
        row.pendingExpiresAt !== null &&
        row.pendingExpiresAt > now,
    )
    .map((row) => row.id);
  if (pendingIds.length === 0) {
    return { promotedCount: 0, promotedIds: [] };
  }

  const promotedRows = await db
    .update(needsDeepeningTopics)
    .set({
      status: 'active',
      pendingExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        inArray(needsDeepeningTopics.id, pendingIds),
        eq(needsDeepeningTopics.profileId, profileId),
        eq(needsDeepeningTopics.topicId, topicId),
        eq(needsDeepeningTopics.status, 'pending_review'),
        gt(needsDeepeningTopics.pendingExpiresAt, now),
      ),
    )
    .returning({ id: needsDeepeningTopics.id });

  return {
    promotedCount: promotedRows.length,
    promotedIds: promotedRows.map((row) => row.id),
  };
}

export async function expirePendingDeepeningRows(
  db: Database,
  now = new Date(),
): Promise<ExpirePendingDeepeningRowsResult> {
  // System-wide expiry cron - intentionally cross-profile. Per-profile scope is
  // not required because the WHERE filters on (status, pending_expires_at) only.
  // We UPDATE to 'resolved' rather than DELETE so the audit trail of every
  // "learner had a wobble here that never got corroborated" survives.
  // scope-allow: system-wide expiry cron intentionally resolves due pending rows.
  const expiredRows = await db
    .update(needsDeepeningTopics)
    .set({
      status: 'resolved',
      pendingExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(needsDeepeningTopics.status, 'pending_review'),
        isNotNull(needsDeepeningTopics.pendingExpiresAt),
        lt(needsDeepeningTopics.pendingExpiresAt, now),
      ),
    )
    .returning({ id: needsDeepeningTopics.id });

  return {
    expiredCount: expiredRows.length,
    expiredIds: expiredRows.map((row) => row.id),
  };
}
