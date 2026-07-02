import { sql } from 'drizzle-orm';

import { conceptMastery, concepts, type Database } from '@eduagent/database';
import type { ChallengeRoundEvaluationItem } from '@eduagent/schemas';

/**
 * Concept-capture (the Challenge-Round "mastery star" feature) is now ACTIVE.
 * It was PARKED in code (kill-switch off) until the MMT-ADR-0012 baseline-reset
 * tables landed and the identity-cutover `profiles`→`person` FK repoint applied
 * to `concepts` / `concept_mastery`. Both conditions are now satisfied on
 * staging and production (live-verified: no `profiles` table exists in either
 * environment; both tables' `profile_id` FKs reference `person(id)`; RLS
 * profile-isolation policies from migration 0125 / WI-1104 are enabled).
 * `concepts` / `concept_mastery` row counts were 0/0 at flip time.
 *
 * Gate is applied at the single live call site (session-exchange.ts) rather than
 * inside captureConceptMastery, so the function and its integration tests still
 * exercise the real write path against a DB that has the tables. Note: actual
 * traffic through this path still requires `CHALLENGE_ROUND_RUNTIME_ENABLED`,
 * which is a separate flag and is `false` on staging/prod as of this flip — so
 * the flip is presently inert in those environments until Challenge Round
 * runtime is separately enabled.
 */
export const CONCEPT_CAPTURE_ENABLED = true;

export interface ConceptCaptureSession {
  id: string;
  subjectId: string | null;
}

type NormalizedConceptEvaluation = ChallengeRoundEvaluationItem & {
  label: string;
  normalizedLabel: string;
};

function displayLabelForConcept(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

function normalizedLabelForConcept(label: string): string {
  return displayLabelForConcept(label).toLowerCase();
}

function normalizeEvaluations(
  evaluations: ChallengeRoundEvaluationItem[],
): NormalizedConceptEvaluation[] {
  const byNormalizedLabel = new Map<string, NormalizedConceptEvaluation>();

  for (const item of evaluations) {
    const label = displayLabelForConcept(item.concept);
    if (label.length === 0) continue;

    byNormalizedLabel.set(normalizedLabelForConcept(label), {
      ...item,
      label,
      normalizedLabel: normalizedLabelForConcept(label),
    });
  }

  return [...byNormalizedLabel.values()];
}

async function supersedeUnevaluatedLiveConcepts(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  profileId: string,
  topicId: string,
  evaluatedConceptIds: string[],
  now: Date,
): Promise<void> {
  if (evaluatedConceptIds.length === 0) return;

  const evaluatedIds = sql.join(
    evaluatedConceptIds.map((conceptId) => sql`${conceptId}`),
    sql`, `,
  );

  await tx.execute(sql`
    UPDATE "concept_mastery"
    SET "superseded_at" = ${now}, "updated_at" = ${now}
    FROM "concepts"
    WHERE "concept_mastery"."concept_id" = "concepts"."id"
      AND "concept_mastery"."profile_id" = ${profileId}
      AND "concepts"."profile_id" = ${profileId}
      AND "concepts"."topic_id" = ${topicId}
      AND "concept_mastery"."superseded_at" IS NULL
      AND "concept_mastery"."last_evaluated_at" < ${now}
      AND "concept_mastery"."concept_id" NOT IN (${evaluatedIds})
  `);
}

/**
 * Capture the completed Challenge Round's enriched evaluation list, including
 * solid and weak concepts. Offered/declined/ignored/timed-out/aborted rounds do
 * not call this function, so they never write or supersede mastery.
 *
 * Current Challenge Rounds are conversational and may not prove a full topic
 * decomposition. Supersession therefore only retires older live rows after a
 * later completed capture round stamps a new `lastEvaluatedAt` on the concepts
 * it did evaluate.
 */
export async function captureConceptMastery(
  db: Database,
  profileId: string,
  session: ConceptCaptureSession,
  topicId: string,
  evaluations: ChallengeRoundEvaluationItem[],
  now = new Date(),
): Promise<void> {
  if (!session.subjectId) return;

  const subjectId = session.subjectId;
  const normalizedEvaluations = normalizeEvaluations(evaluations);
  if (normalizedEvaluations.length === 0) return;

  await db.transaction(async (tx) => {
    const evaluatedConceptIds: string[] = [];

    for (const item of normalizedEvaluations) {
      const [concept] = await tx
        .insert(concepts)
        .values({
          profileId,
          subjectId,
          topicId,
          label: item.label,
          normalizedLabel: item.normalizedLabel,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            concepts.profileId,
            concepts.topicId,
            concepts.normalizedLabel,
          ],
          set: {
            label: item.label,
            updatedAt: now,
          },
        })
        .returning({ id: concepts.id });

      if (!concept) {
        throw new Error('Concept upsert did not return a row');
      }
      evaluatedConceptIds.push(concept.id);

      const masteryUpdate: Partial<typeof conceptMastery.$inferInsert> = {
        profileId,
        status: item.result,
        lastEvaluatedAt: now,
        supersededAt: null,
        sourceSessionId: session.id,
        learnerQuote: item.learnerQuote,
        updatedAt: now,
      };
      if (item.result === 'solid') {
        masteryUpdate.verifiedAt = now;
      }

      await tx
        .insert(conceptMastery)
        .values({
          conceptId: concept.id,
          profileId,
          status: item.result,
          verifiedAt: item.result === 'solid' ? now : null,
          lastEvaluatedAt: now,
          supersededAt: null,
          sourceSessionId: session.id,
          learnerQuote: item.learnerQuote,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: conceptMastery.conceptId,
          set: masteryUpdate,
        });
    }

    await supersedeUnevaluatedLiveConcepts(
      tx,
      profileId,
      topicId,
      evaluatedConceptIds,
      now,
    );
  });
}
