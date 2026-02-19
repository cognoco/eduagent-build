// ---------------------------------------------------------------------------
// XP Tracking — Story 4.5
// Business logic + DB-aware helpers, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import {
  assessments,
  xpLedger,
  createScopedRepository,
  type Database,
} from '@eduagent/database';

export interface XpEvent {
  profileId: string;
  topicId: string;
  subjectId: string;
  amount: number;
  status: 'pending' | 'verified' | 'decayed';
}

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

  const depthMultiplier: Record<string, number> = {
    recall: 1,
    explain: 1.5,
    transfer: 2,
  };

  return Math.round(baseXp * depthMultiplier[verificationDepth]);
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

  // 3. Calculate and insert
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
    status: 'pending',
  });
}
