import { eq, inArray, isNotNull } from 'drizzle-orm';
import {
  mentorNotices,
  needsDeepeningTopics,
  person,
  topicNotes,
  type Database,
} from '@eduagent/database';
import { parseConversationLanguage } from '../llm/conversation-language';
import { classifyPersistedLearningText } from './persisted-remediation';
import type { LearningTextFieldKind } from './scan';

/**
 * [WI-2753] Applies the remediation classification to persisted rows.
 *
 * SCRUB-IN-PLACE, NOT DELETE. AC-2 inherits the scalar-evidence-identity
 * precedent that a purge preserves the record: the row and its relationships
 * survive, only the offending text goes. Two of the four columns here are
 * NOT NULL `text`, which does NOT force a migration — "scrub" on a text column
 * means overwriting with a redaction placeholder, not setting null. That
 * distinction is what keeps this item free of any schema change.
 */
export const REDACTED_PLACEHOLDER = '[redacted: clinical inference removed]';

export interface SurfaceRemediationReport {
  readonly surface: string;
  /** Rows carrying text that was classified. */
  readonly scanned: number;
  /** Rows whose text was an attribution and was scrubbed. */
  readonly remediated: number;
  /**
   * Rows the gate blocked as `unclear` — reported, never modified. These are
   * the ambiguous cases (an educational reference reads the same as a clinical
   * one under migration provenance), and resolving ambiguity by destroying
   * learner-visible text is not something an unattended backfill may do.
   */
  readonly review: number;
}

interface LoadedRow {
  readonly id: string;
  readonly text: string | null;
  readonly rawLanguage: string | null;
}

/**
 * Classify one surface's rows, then hand back the ids to scrub and the count to
 * report. Shared so every surface uses ONE classification path and no surface
 * can drift into its own term list (AC-3).
 */
async function classifySurface(
  rows: readonly LoadedRow[],
  fieldKind: LearningTextFieldKind,
): Promise<{ remediate: string[]; review: number; scanned: number }> {
  const withText = rows.filter((row) => typeof row.text === 'string');
  if (withText.length === 0) {
    return { remediate: [], review: 0, scanned: 0 };
  }

  const verdicts = await classifyPersistedLearningText({
    fieldKind,
    rows: withText.map((row) => ({
      id: row.id,
      text: row.text,
      // Never the raw column: an unrecognised or null code must collapse to
      // `undefined` so the gate scans every grammar, rather than being read as
      // a language it is not.
      conversationLanguage: parseConversationLanguage(row.rawLanguage),
    })),
  });

  return {
    scanned: withText.length,
    remediate: verdicts
      .filter((verdict) => verdict.disposition === 'remediate')
      .map((verdict) => verdict.id),
    review: verdicts.filter((verdict) => verdict.disposition === 'review')
      .length,
  };
}

/**
 * Remediate the mentor-notice surfaces.
 *
 * The concept is NOT NULL and is what a notice IS, so a scrubbed notice has
 * nothing left to say — it is also moved to `faded`, the existing read-excluding
 * terminal status the fade job already uses, so no reader surfaces a placeholder
 * to a learner. The correction hint is nullable and optional by design, so a
 * notice without one is an already-handled state and it is simply nulled.
 */
export async function remediateMentorNotices(
  db: Database,
): Promise<SurfaceRemediationReport[]> {
  const rows = await db
    .select({
      id: mentorNotices.id,
      concept: mentorNotices.concept,
      correctionHint: mentorNotices.correctionHint,
      rawLanguage: person.conversationLanguage,
    })
    .from(mentorNotices)
    .innerJoin(person, eq(mentorNotices.profileId, person.id));

  const concepts = await classifySurface(
    rows.map((row) => ({
      id: row.id,
      text: row.concept,
      rawLanguage: row.rawLanguage,
    })),
    'mentor_notice_concept',
  );

  if (concepts.remediate.length > 0) {
    await db
      .update(mentorNotices)
      .set({ concept: REDACTED_PLACEHOLDER, status: 'faded' })
      .where(inArray(mentorNotices.id, concepts.remediate));
  }

  const hints = await classifySurface(
    rows.map((row) => ({
      id: row.id,
      text: row.correctionHint,
      rawLanguage: row.rawLanguage,
    })),
    'mentor_notice_correction_hint',
  );

  if (hints.remediate.length > 0) {
    await db
      .update(mentorNotices)
      .set({ correctionHint: null })
      .where(inArray(mentorNotices.id, hints.remediate));
  }

  return [
    {
      surface: 'mentor_notices.concept',
      scanned: concepts.scanned,
      remediated: concepts.remediate.length,
      review: concepts.review,
    },
    {
      surface: 'mentor_notices.correction_hint',
      scanned: hints.scanned,
      remediated: hints.remediate.length,
      review: hints.review,
    },
  ];
}

/**
 * Remediate learner-authored topic notes.
 *
 * `content` is NOT NULL, and this is the learner's own writing — the placeholder
 * keeps the note (and its topic linkage) addressable rather than deleting a
 * record the learner created.
 */
export async function remediateTopicNotes(
  db: Database,
): Promise<SurfaceRemediationReport> {
  const rows = await db
    .select({
      id: topicNotes.id,
      text: topicNotes.content,
      rawLanguage: person.conversationLanguage,
    })
    .from(topicNotes)
    .innerJoin(person, eq(topicNotes.profileId, person.id));

  const result = await classifySurface(rows, 'note_text');

  if (result.remediate.length > 0) {
    await db
      .update(topicNotes)
      .set({ content: REDACTED_PLACEHOLDER })
      .where(inArray(topicNotes.id, result.remediate));
  }

  return {
    surface: 'topic_notes.content',
    scanned: result.scanned,
    remediated: result.remediate.length,
    review: result.review,
  };
}

/**
 * Remediate needs-deepening misconceptions.
 *
 * Nullable, and the live write gate already writes null here on a block — so
 * nulling is the treatment that already exists for this column rather than a new
 * one invented for the backfill.
 */
export async function remediateNeedsDeepening(
  db: Database,
): Promise<SurfaceRemediationReport> {
  const rows = await db
    .select({
      id: needsDeepeningTopics.id,
      text: needsDeepeningTopics.misconception,
      rawLanguage: person.conversationLanguage,
    })
    .from(needsDeepeningTopics)
    .innerJoin(person, eq(needsDeepeningTopics.profileId, person.id))
    .where(isNotNull(needsDeepeningTopics.misconception));

  const result = await classifySurface(rows, 'needs_deepening');

  if (result.remediate.length > 0) {
    await db
      .update(needsDeepeningTopics)
      .set({ misconception: null })
      .where(inArray(needsDeepeningTopics.id, result.remediate));
  }

  return {
    surface: 'needs_deepening_topics.misconception',
    scanned: result.scanned,
    remediated: result.remediate.length,
    review: result.review,
  };
}

/**
 * Run every text-column surface and return one report per surface.
 *
 * Idempotent (AC-4): the placeholder and the null are both classified `clear` on
 * a second pass, so a re-run scrubs nothing further and reports zero remediated.
 */
export async function remediatePersistedLearningText(
  db: Database,
): Promise<SurfaceRemediationReport[]> {
  return [
    ...(await remediateMentorNotices(db)),
    await remediateTopicNotes(db),
    await remediateNeedsDeepening(db),
  ];
}
