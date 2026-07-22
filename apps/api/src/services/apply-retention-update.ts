import { and, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { retentionCards, type Database } from '@eduagent/database';
import type { RecallFeedback } from '@eduagent/schemas';
import { syncXpLedgerStatus } from './xp';

export interface RetentionCardSet {
  easeFactor?: number;
  intervalDays?: number;
  repetitions?: number;
  lastReviewedAt?: Date | null;
  nextReviewAt?: Date | null;
  masteredAt?: Date | null;
  failureCount?: number;
  consecutiveSuccesses?: number;
  xpStatus?: 'pending' | 'verified' | 'decayed';
  evaluateDifficultyRung?: 1 | 2 | 3 | 4 | null;
  // [WI-2114] Grader-owned structured feedback of the last graded recall —
  // never the learner's raw answer (AC-7).
  lastRecallFeedback?: RecallFeedback | null;
}

export type RetentionUpdateGuard =
  | { kind: 'none' }
  | { kind: 'updatedAtEquals'; updatedAt: Date }
  | { kind: 'optimisticLock'; updatedAt: Date }
  | {
      kind: 'cooldownClaim';
      cooldownThreshold: Date;
      allowLastReviewedAt?: Date;
    }
  | { kind: 'masteredAtNull' }
  | { kind: 'repetitionsZero' };

export interface ApplyRetentionUpdateParams {
  db: Database;
  profileId: string;
  cardId: string;
  set: RetentionCardSet;
  guard: RetentionUpdateGuard;
  updatedAt: Date;
}

function buildGuardPredicate(guard: RetentionUpdateGuard): SQL | undefined {
  switch (guard.kind) {
    case 'none':
      return undefined;
    case 'updatedAtEquals':
    case 'optimisticLock':
      return eq(retentionCards.updatedAt, guard.updatedAt);
    case 'cooldownClaim':
      return or(
        isNull(retentionCards.lastReviewedAt),
        lt(retentionCards.lastReviewedAt, guard.cooldownThreshold),
        ...(guard.allowLastReviewedAt
          ? [eq(retentionCards.lastReviewedAt, guard.allowLastReviewedAt)]
          : []),
      );
    case 'masteredAtNull':
      return isNull(retentionCards.masteredAt);
    case 'repetitionsZero':
      return eq(retentionCards.repetitions, 0);
  }
}

function buildSetClause(
  set: RetentionCardSet,
  updatedAt: Date,
): Partial<typeof retentionCards.$inferInsert> {
  const setClause: Partial<typeof retentionCards.$inferInsert> = { updatedAt };

  if (set.easeFactor !== undefined) setClause.easeFactor = set.easeFactor;
  if (set.intervalDays !== undefined) setClause.intervalDays = set.intervalDays;
  if (set.repetitions !== undefined) setClause.repetitions = set.repetitions;
  if (set.lastReviewedAt !== undefined) {
    setClause.lastReviewedAt = set.lastReviewedAt;
  }
  if (set.nextReviewAt !== undefined) setClause.nextReviewAt = set.nextReviewAt;
  if (set.masteredAt !== undefined) setClause.masteredAt = set.masteredAt;
  if (set.failureCount !== undefined) {
    setClause.failureCount = set.failureCount;
  }
  if (set.consecutiveSuccesses !== undefined) {
    setClause.consecutiveSuccesses = set.consecutiveSuccesses;
  }
  if (set.xpStatus !== undefined) setClause.xpStatus = set.xpStatus;
  if (set.evaluateDifficultyRung !== undefined) {
    setClause.evaluateDifficultyRung = set.evaluateDifficultyRung;
  }
  if (set.lastRecallFeedback !== undefined) {
    setClause.lastRecallFeedback = set.lastRecallFeedback;
  }

  return setClause;
}

export async function applyRetentionUpdate({
  db,
  profileId,
  cardId,
  set,
  guard,
  updatedAt,
}: ApplyRetentionUpdateParams): Promise<{ updated: boolean }> {
  const guardPredicate = buildGuardPredicate(guard);
  const predicates = [
    eq(retentionCards.id, cardId),
    eq(retentionCards.profileId, profileId),
  ];
  if (guardPredicate) predicates.push(guardPredicate);

  // scope-allow: predicates is built immediately above with retentionCards.profileId.
  const result = await db
    .update(retentionCards)
    .set(buildSetClause(set, updatedAt))
    .where(and(...predicates))
    .returning({ id: retentionCards.id });

  return { updated: result.length > 0 };
}

export async function insertRetentionCardIfAbsent({
  db,
  profileId,
  topicId,
}: {
  db: Database;
  profileId: string;
  topicId: string;
}): Promise<void> {
  await db
    .insert(retentionCards)
    .values({
      profileId,
      topicId,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
    })
    .onConflictDoNothing({
      target: [retentionCards.profileId, retentionCards.topicId],
    });
}

export async function resetRetentionCardForRelearn({
  db,
  profileId,
  topicId,
}: {
  db: Database;
  profileId: string;
  topicId: string;
}): Promise<void> {
  await db
    .update(retentionCards)
    .set({
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
      nextReviewAt: null,
      lastReviewedAt: null,
      updatedAt: sql`${retentionCards.updatedAt}`,
    })
    .where(
      and(
        eq(retentionCards.topicId, topicId),
        eq(retentionCards.profileId, profileId),
      ),
    );
}

export async function syncRewardStatusFromRetention({
  db,
  profileId,
  topicId,
  status,
}: {
  db: Database;
  profileId: string;
  topicId: string;
  status: 'verified' | 'decayed';
}): Promise<boolean> {
  return syncXpLedgerStatus(db, profileId, topicId, status);
}
