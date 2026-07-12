import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import {
  assessments,
  createScopedRepository,
  curriculumTopics,
  needsDeepeningTopics,
  retentionCards,
  topicNotes,
  type Database,
} from '@eduagent/database';
import type { VerifiedProofReceipt } from '@eduagent/schemas';
import {
  assertChargeNotCredentialed,
  assertParentAccess,
} from './family-access';
import { assertChildDashboardDataVisible } from './dashboard';
import { resolveMasteryVerificationState } from './challenge-round/verification';
import { getRetentionStatus } from './retention';

// [WI-1658 rework] Read-side quote age-out (AC4). WI-1194 cites this same
// 30-day window as the clock verbatim quotes should align to (its
// description: quotes "currently survive the 30-day transcript purge") — it
// is also the literal cutoff `transcript-purge-cron.ts` already uses
// (`cutoff.setUTCDate(cutoff.getUTCDate() - 30)`). Deleting the aged row
// (write-side purge) stays WI-1194's scope; this is read-side suppression
// only — past the window the quote reads back as null and the existing
// degradation branch below renders the abstracted line instead.
const QUOTE_AGE_OUT_DAYS = 30;

/**
 * The verified artifact for one exact Recap session/topic. Unlike the home
 * card's child-latest receipt, `hasProof` requires both a Challenge-verified
 * assessment and a kept `challenge_drafted_note` row. The note body is the
 * only quote source; this resolver never reads `session_events` or any
 * unmarked note. Past the 30-day read window the artifact remains eligible but
 * its quote is suppressed, preserving topic/date/state co-presentation.
 */
export async function getVerifiedProofForSessionTopic(
  db: Database,
  childProfileId: string,
  sessionId: string,
  topicId: string,
): Promise<VerifiedProofReceipt> {
  const [verified] = await db
    .select({
      topicId: assessments.topicId,
      subjectId: assessments.subjectId,
      sessionId: assessments.sessionId,
      verifiedAt: assessments.masteryChallengeVerifiedAt,
      topicTitle: curriculumTopics.title,
    })
    .from(assessments)
    .innerJoin(curriculumTopics, eq(curriculumTopics.id, assessments.topicId))
    .where(
      and(
        eq(assessments.profileId, childProfileId),
        eq(assessments.sessionId, sessionId),
        eq(assessments.topicId, topicId),
        isNotNull(assessments.masteryChallengeVerifiedAt),
      ),
    )
    .orderBy(desc(assessments.masteryChallengeVerifiedAt))
    .limit(1);

  if (!verified || !verified.sessionId || !verified.verifiedAt) {
    return { hasProof: false, quote: null };
  }

  // The note read keeps direct db access — an orderBy(desc) + limit(1) pair
  // the scoped repo's findFirst/findMany cannot express (sanctioned deviation).
  // The single-table weak-spot and retention-card reads go through the scoped
  // repository, which pins profileId for us.
  const repo = createScopedRepository(db, childProfileId);
  const [noteRows, weakSpotRows, retentionCard] = await Promise.all([
    db
      .select({ content: topicNotes.content, createdAt: topicNotes.createdAt })
      .from(topicNotes)
      .where(
        and(
          eq(topicNotes.profileId, childProfileId),
          eq(topicNotes.topicId, topicId),
          eq(topicNotes.sessionId, sessionId),
          eq(topicNotes.artifactSource, 'challenge_drafted_note'),
        ),
      )
      .orderBy(desc(topicNotes.createdAt))
      .limit(1),
    repo.needsDeepeningTopics.findMany(
      eq(needsDeepeningTopics.topicId, topicId),
    ),
    repo.retentionCards.findFirst(eq(retentionCards.topicId, topicId)),
  ]);

  const note = noteRows[0];
  if (!note) {
    return { hasProof: false, quote: null };
  }

  const quoteAgeOutCutoff = new Date();
  quoteAgeOutCutoff.setUTCDate(
    quoteAgeOutCutoff.getUTCDate() - QUOTE_AGE_OUT_DAYS,
  );

  return {
    hasProof: true,
    topicId: verified.topicId,
    topicTitle: verified.topicTitle,
    subjectId: verified.subjectId,
    sessionId: verified.sessionId,
    verifiedAt: verified.verifiedAt.toISOString(),
    quote:
      note.createdAt.getTime() >= quoteAgeOutCutoff.getTime()
        ? note.content
        : null,
    masteryVerificationState: resolveMasteryVerificationState({
      verifiedAt: verified.verifiedAt,
      newWeakSpotRows: weakSpotRows,
    }),
    retentionStatus: retentionCard
      ? getRetentionStatus({
          ...retentionCard,
          lastReviewedAt: retentionCard.lastReviewedAt?.toISOString() ?? null,
          nextReviewAt: retentionCard.nextReviewAt?.toISOString() ?? null,
        })
      : undefined,
    nextReviewDate: retentionCard?.nextReviewAt?.toISOString(),
  };
}

/**
 * [WI-1658] The most recent verified-proof receipt for a child, for the
 * parent-facing home card. Consumes ONLY verified artifacts per the Artifact
 * Provenance Contract (docs/specs/2026-07-06-verified-learning-loop.md):
 * the quote (when present) always comes from a `topic_notes` row explicitly
 * marked `artifact_source = 'challenge_drafted_note'` — never a raw
 * transcript, never an unmarked learner/session-summary note. Co-presents
 * `masteryVerificationState` alongside the fact per MMT-ADR-0031 §5 — never
 * an unqualified "verified forever" claim. The quote read-side ages out past
 * `QUOTE_AGE_OUT_DAYS` (AC4): topic/date/verification-status keep returning,
 * only the quote itself drops to null and the caller's abstracted-line
 * degradation branch takes over.
 *
 * Parent-chain read (assessments/topic_notes/retentionCards joined/filtered
 * by `childProfileId`, not the requesting parent's own profileId) — the
 * sanctioned deviation from `createScopedRepository`, matching the existing
 * pattern in `getChildSessionDetail` (services/dashboard.ts).
 */
export async function getLatestVerifiedProofForChild(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<VerifiedProofReceipt> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  await assertChargeNotCredentialed(db, childProfileId);
  await assertChildDashboardDataVisible(db, childProfileId);

  const [latest] = await db
    .select({
      topicId: assessments.topicId,
      subjectId: assessments.subjectId,
      sessionId: assessments.sessionId,
      verifiedAt: assessments.masteryChallengeVerifiedAt,
      topicTitle: curriculumTopics.title,
    })
    .from(assessments)
    .innerJoin(curriculumTopics, eq(curriculumTopics.id, assessments.topicId))
    .where(
      and(
        eq(assessments.profileId, childProfileId),
        isNotNull(assessments.masteryChallengeVerifiedAt),
      ),
    )
    .orderBy(desc(assessments.masteryChallengeVerifiedAt))
    .limit(1);

  if (!latest || !latest.sessionId || !latest.verifiedAt) {
    return { hasProof: false, quote: null };
  }

  const quoteAgeOutCutoff = new Date();
  quoteAgeOutCutoff.setUTCDate(
    quoteAgeOutCutoff.getUTCDate() - QUOTE_AGE_OUT_DAYS,
  );

  const [noteRow, weakSpotRows, retentionCard] = await Promise.all([
    db
      .select({ content: topicNotes.content })
      .from(topicNotes)
      .where(
        and(
          eq(topicNotes.profileId, childProfileId),
          eq(topicNotes.topicId, latest.topicId),
          eq(topicNotes.sessionId, latest.sessionId),
          eq(topicNotes.artifactSource, 'challenge_drafted_note'),
          gte(topicNotes.createdAt, quoteAgeOutCutoff),
        ),
      )
      .orderBy(desc(topicNotes.createdAt))
      .limit(1),
    db
      .select({
        status: needsDeepeningTopics.status,
        createdAt: needsDeepeningTopics.createdAt,
      })
      .from(needsDeepeningTopics)
      .where(
        and(
          eq(needsDeepeningTopics.profileId, childProfileId),
          eq(needsDeepeningTopics.topicId, latest.topicId),
        ),
      ),
    db
      .select()
      .from(retentionCards)
      .where(
        and(
          eq(retentionCards.profileId, childProfileId),
          eq(retentionCards.topicId, latest.topicId),
        ),
      )
      .limit(1),
  ]);

  return {
    hasProof: true,
    topicId: latest.topicId,
    topicTitle: latest.topicTitle,
    subjectId: latest.subjectId,
    sessionId: latest.sessionId,
    verifiedAt: latest.verifiedAt.toISOString(),
    // Degradation branch (AC4): quote is null when no marked note was ever
    // persisted for this round (e.g. finalize only produced a fallback
    // prompt) — the card still shows the verified fact, never a fabricated
    // quote or a fallback to raw transcript.
    quote: noteRow[0]?.content ?? null,
    masteryVerificationState: resolveMasteryVerificationState({
      verifiedAt: latest.verifiedAt,
      newWeakSpotRows: weakSpotRows,
    }),
    retentionStatus: retentionCard[0]
      ? getRetentionStatus({
          ...retentionCard[0],
          lastReviewedAt:
            retentionCard[0].lastReviewedAt?.toISOString() ?? null,
          nextReviewAt: retentionCard[0].nextReviewAt?.toISOString() ?? null,
        })
      : undefined,
  };
}
