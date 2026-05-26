import { and, eq, inArray } from 'drizzle-orm';

import {
  assessments,
  createScopedRepository,
  curricula,
  curriculumTopics,
  learningSessions,
  needsDeepeningTopics,
  subjects,
  type Database,
} from '@eduagent/database';
import { NotFoundError } from '@eduagent/schemas';

import type { ReviewTarget } from './evaluation';

const PENDING_REVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface ChallengeRoundPersistenceInput {
  sessionId: string;
  topicId: string;
  now?: Date;
}

interface PersistMasteryEvidenceResult {
  assessmentId: string;
}

interface UpsertWeakSpotsInput extends ChallengeRoundPersistenceInput {
  reviewTargets: ReviewTarget[];
}

interface UpsertWeakSpotsResult {
  insertedCount: number;
  insertedIds: string[];
  updatedCount: number;
  updatedIds: string[];
}

type OwnedChallengeRoundTopic = {
  sessionId: string;
  subjectId: string;
  topicId: string;
};

type NeedsDeepeningRow = typeof needsDeepeningTopics.$inferSelect;
type NormalizedReviewTarget = ReviewTarget & { concept: string };

async function resolveOwnedChallengeRoundTopic(
  db: Database,
  profileId: string,
  input: ChallengeRoundPersistenceInput,
): Promise<OwnedChallengeRoundTopic> {
  const [row] = await db
    .select({
      sessionId: learningSessions.id,
      subjectId: learningSessions.subjectId,
      topicId: learningSessions.topicId,
    })
    .from(learningSessions)
    .innerJoin(
      curriculumTopics,
      eq(curriculumTopics.id, learningSessions.topicId),
    )
    .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, learningSessions.subjectId),
        eq(subjects.id, curricula.subjectId),
      ),
    )
    .where(
      and(
        eq(learningSessions.id, input.sessionId),
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.sessionType, 'learning'),
        eq(learningSessions.topicId, input.topicId),
        eq(curriculumTopics.id, input.topicId),
        eq(subjects.profileId, profileId),
      ),
    )
    .limit(1);

  if (!row || row.topicId === null) {
    throw new NotFoundError('Session');
  }

  return {
    sessionId: row.sessionId,
    subjectId: row.subjectId,
    topicId: row.topicId,
  };
}

function normalizeReviewTargets(
  reviewTargets: ReviewTarget[],
): NormalizedReviewTarget[] {
  const byConcept = new Map<string, NormalizedReviewTarget>();
  for (const target of reviewTargets) {
    const concept = target.concept.trim();
    if (concept.length === 0) continue;
    byConcept.set(concept, { ...target, concept });
  }
  return [...byConcept.values()];
}

function newestMatchingRow(
  rows: NeedsDeepeningRow[],
  profileId: string,
  owner: OwnedChallengeRoundTopic,
  concept: string,
): NeedsDeepeningRow | undefined {
  const matching = rows
    .filter(
      (row) =>
        row.profileId === profileId &&
        row.subjectId === owner.subjectId &&
        row.topicId === owner.topicId &&
        row.source === 'challenge_round' &&
        row.concept === concept &&
        (row.status === 'active' || row.status === 'pending_review'),
    )
    .sort((left, right) => {
      const createdAtDelta =
        right.createdAt.getTime() - left.createdAt.getTime();
      return createdAtDelta !== 0
        ? createdAtDelta
        : right.id.localeCompare(left.id);
    });

  return matching[0];
}

export async function persistChallengeRoundMasteryEvidence(
  db: Database,
  profileId: string,
  input: ChallengeRoundPersistenceInput,
): Promise<PersistMasteryEvidenceResult> {
  const now = input.now ?? new Date();
  const owner = await resolveOwnedChallengeRoundTopic(db, profileId, input);
  const [inserted] = await db
    .insert(assessments)
    .values({
      profileId,
      subjectId: owner.subjectId,
      topicId: owner.topicId,
      sessionId: owner.sessionId,
      verificationDepth: 'transfer',
      status: 'passed',
      masteryScore: 1,
      qualityRating: 5,
      exchangeHistory: [],
      masteryChallengeVerifiedAt: now,
    })
    .returning({ id: assessments.id });

  if (!inserted) {
    throw new Error('Challenge Round assessment insert did not return a row');
  }

  return { assessmentId: inserted.id };
}

export async function upsertChallengeRoundWeakSpots(
  db: Database,
  profileId: string,
  input: UpsertWeakSpotsInput,
): Promise<UpsertWeakSpotsResult> {
  const targets = normalizeReviewTargets(input.reviewTargets);
  if (targets.length === 0) {
    return {
      insertedCount: 0,
      insertedIds: [],
      updatedCount: 0,
      updatedIds: [],
    };
  }

  const now = input.now ?? new Date();
  const pendingExpiresAt = new Date(now.getTime() + PENDING_REVIEW_TTL_MS);
  const owner = await resolveOwnedChallengeRoundTopic(db, profileId, input);
  const concepts = targets.map((target) => target.concept);
  const repo = createScopedRepository(db, profileId);
  const existingRows = await repo.needsDeepeningTopics.findMany(
    and(
      eq(needsDeepeningTopics.subjectId, owner.subjectId),
      eq(needsDeepeningTopics.topicId, owner.topicId),
      eq(needsDeepeningTopics.source, 'challenge_round'),
      inArray(needsDeepeningTopics.status, ['active', 'pending_review']),
      inArray(needsDeepeningTopics.concept, concepts),
    ),
  );

  const insertedIds: string[] = [];
  const updatedIds: string[] = [];
  const rowsToInsert: Array<typeof needsDeepeningTopics.$inferInsert> = [];

  for (const target of targets) {
    const existing = newestMatchingRow(
      existingRows,
      profileId,
      owner,
      target.concept,
    );

    if (!existing) {
      rowsToInsert.push({
        profileId,
        subjectId: owner.subjectId,
        topicId: owner.topicId,
        status: 'pending_review',
        source: 'challenge_round',
        concept: target.concept,
        misconception: target.misconception ?? null,
        correction: target.correction ?? null,
        pendingExpiresAt,
        updatedAt: now,
      });
      continue;
    }

    const updateValues: Partial<typeof needsDeepeningTopics.$inferInsert> = {
      status: existing.status,
      concept: target.concept,
      misconception: target.misconception ?? null,
      correction: target.correction ?? null,
      updatedAt: now,
    };
    if (existing.status === 'pending_review') {
      updateValues.pendingExpiresAt = pendingExpiresAt;
    }

    const updatedRows = await db
      .update(needsDeepeningTopics)
      .set(updateValues)
      .where(
        and(
          eq(needsDeepeningTopics.id, existing.id),
          eq(needsDeepeningTopics.profileId, profileId),
          eq(needsDeepeningTopics.subjectId, owner.subjectId),
          eq(needsDeepeningTopics.topicId, owner.topicId),
          eq(needsDeepeningTopics.source, 'challenge_round'),
          eq(needsDeepeningTopics.concept, target.concept),
          eq(needsDeepeningTopics.status, existing.status),
        ),
      )
      .returning({ id: needsDeepeningTopics.id });
    updatedIds.push(...updatedRows.map((row) => row.id));
  }

  if (rowsToInsert.length > 0) {
    const insertedRows = await db
      .insert(needsDeepeningTopics)
      .values(rowsToInsert)
      .returning({ id: needsDeepeningTopics.id });
    insertedIds.push(...insertedRows.map((row) => row.id));
  }

  return {
    insertedCount: insertedIds.length,
    insertedIds,
    updatedCount: updatedIds.length,
    updatedIds,
  };
}
