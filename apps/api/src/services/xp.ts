// ---------------------------------------------------------------------------
// XP Tracking — Story 4.5
// Business logic + DB-aware helpers, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import {
  assessments,
  learningSessions,
  xpLedger,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import { getLearningMode, getLearningModeRules } from './settings';

export interface XpEvent {
  profileId: string;
  topicId: string;
  subjectId: string;
  amount: number;
  status: 'pending' | 'verified' | 'decayed';
}

export const REFLECTION_XP_MULTIPLIER = 1.5;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Calculates XP for a topic based on mastery score and verification depth.
 *
 * Base XP: 100 * masteryScore
 * Depth bonus: recall = 1x, explain = 1.5x, transfer = 2x
 * Result is rounded to the nearest integer.
 */
export function calculateTopicXp(
  masteryScore: number,
  verificationDepth: 'recall' | 'explain' | 'transfer'
): number {
  const baseXp = 100 * masteryScore;

  const depthMultiplier: Record<'recall' | 'explain' | 'transfer', number> = {
    recall: 1,
    explain: 1.5,
    transfer: 2,
  };

  const multiplier = depthMultiplier[verificationDepth];
  if (multiplier == null)
    throw new Error(`Unknown verificationDepth: ${verificationDepth}`);
  return Math.round(baseXp * multiplier);
}

/**
 * Verifies pending XP — returns the verified amount (same as pending).
 */
export function verifyXp(pendingAmount: number): number {
  return pendingAmount;
}

/**
 * Decays XP proportionally based on mastery drop.
 *
 * The decay is proportional: currentAmount * masteryDrop
 * Result is subtracted from currentAmount, never goes below 0.
 */
export function decayXp(currentAmount: number, masteryDrop: number): number {
  const decayAmount = currentAmount * masteryDrop;
  return Math.max(0, Math.round(currentAmount - decayAmount));
}

// ---------------------------------------------------------------------------
// DB-aware helpers
// ---------------------------------------------------------------------------

/**
 * Inserts a pending XP ledger entry for a completed session.
 *
 * Looks up the latest passed assessment for the profile+topic,
 * checks for duplicate entries, then calculates and inserts XP.
 * No-ops when topicId is null, no passed assessment exists, or
 * an XP entry already exists for that topic.
 */
export async function insertSessionXpEntry(
  db: Database,
  profileId: string,
  topicId: string | null,
  subjectId: string
): Promise<void> {
  if (!topicId) return;

  // 1. Look up latest passed assessment for profile+topic
  const assessment = await db.query.assessments.findFirst({
    where: and(
      eq(assessments.profileId, profileId),
      eq(assessments.topicId, topicId),
      eq(assessments.status, 'passed')
    ),
  });
  if (!assessment || !assessment.masteryScore) return;

  // 2. Check for existing XP entry (avoid duplicates)
  const repo = createScopedRepository(db, profileId);
  const existing = await repo.xpLedger.findFirst(eq(xpLedger.topicId, topicId));
  if (existing) return;

  // 3. Determine XP status based on learning mode
  //    Casual: completion XP awarded as 'verified' immediately
  //    Serious: XP starts as 'pending', verified on delayed recall
  const { mode } = await getLearningMode(db, profileId);
  const rules = getLearningModeRules(mode);
  const xpStatus = rules.verifiedXpOnly ? 'pending' : 'verified';

  // 4. Calculate and insert
  const mastery = Number(assessment.masteryScore);
  const depth = (assessment.verificationDepth ?? 'recall') as
    | 'recall'
    | 'explain'
    | 'transfer';
  const amount = calculateTopicXp(mastery, depth);

  await db.insert(xpLedger).values({
    profileId,
    topicId,
    subjectId,
    amount,
    status: xpStatus,
    verifiedAt: xpStatus === 'verified' ? new Date() : undefined,
  });
}

/**
 * Syncs the xp_ledger row for a topic to match a retention-derived status change.
 * Called after processRecallTest() updates retention_cards.xpStatus.
 * Returns true if a row was updated, false if no xp_ledger entry existed.
 */
export async function syncXpLedgerStatus(
  db: Database,
  profileId: string,
  topicId: string,
  newStatus: 'verified' | 'decayed'
): Promise<boolean> {
  const now = new Date();
  const result = await db
    .update(xpLedger)
    .set({
      status: newStatus,
      ...(newStatus === 'verified' ? { verifiedAt: now } : {}),
    })
    .where(
      and(eq(xpLedger.profileId, profileId), eq(xpLedger.topicId, topicId))
    )
    .returning({ id: xpLedger.id });

  if (result.length === 0) {
    console.debug(
      `[syncXpLedgerStatus] No xp_ledger row for profile=${profileId} topic=${topicId} — skipped`
    );
    return false;
  }
  return true;
}

export async function applyReflectionMultiplier(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{ applied: boolean; newAmount: number }> {
  const session = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, profileId)
    ),
  });
  if (!session?.topicId) {
    return { applied: false, newAmount: 0 };
  }

  const repo = createScopedRepository(db, profileId);
  const entry = await repo.xpLedger.findFirst(
    eq(xpLedger.topicId, session.topicId)
  );
  if (!entry) {
    return { applied: false, newAmount: 0 };
  }
  if (entry.reflectionMultiplierApplied) {
    return { applied: false, newAmount: entry.amount };
  }

  const newAmount = Math.round(entry.amount * REFLECTION_XP_MULTIPLIER);
  const updated = await db
    .update(xpLedger)
    .set({
      amount: newAmount,
      reflectionMultiplierApplied: true,
    })
    .where(
      and(
        eq(xpLedger.id, entry.id),
        eq(xpLedger.profileId, profileId),
        eq(xpLedger.reflectionMultiplierApplied, false)
      )
    )
    .returning({ id: xpLedger.id });

  if (updated.length === 0) {
    return { applied: false, newAmount: entry.amount };
  }

  return { applied: true, newAmount };
}

export async function getSessionXpEntry(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{ baseXp: number; reflectionBonusXp: number } | null> {
  const session = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, profileId)
    ),
  });
  if (!session?.topicId) {
    return null;
  }

  const repo = createScopedRepository(db, profileId);
  const entry = await repo.xpLedger.findFirst(
    eq(xpLedger.topicId, session.topicId)
  );
  if (!entry) {
    return null;
  }

  if (entry.reflectionMultiplierApplied) {
    const baseXp = Math.round(entry.amount / REFLECTION_XP_MULTIPLIER);
    return {
      baseXp,
      reflectionBonusXp: entry.amount - baseXp,
    };
  }

  const reflectedAmount = Math.round(entry.amount * REFLECTION_XP_MULTIPLIER);
  return {
    baseXp: entry.amount,
    reflectionBonusXp: reflectedAmount - entry.amount,
  };
}
