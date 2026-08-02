import { and, eq, isNotNull } from 'drizzle-orm';
import {
  mentorNotices,
  needsDeepeningTopics,
  topicNotes,
  type Database,
} from '@eduagent/database';
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
  /**
   * Rows classified `remediate` whose bytes changed between the scan and the
   * write, so the guarded update matched nothing and the row was left alone.
   * A later run reclassifies whatever is there now; reporting the count keeps
   * that visible instead of letting `remediated` silently under-count.
   */
  readonly skippedChanged: number;
}

interface TextRow {
  readonly id: string;
  readonly text: string | null;
}

interface SurfaceClassification {
  readonly scanned: number;
  readonly review: number;
  /** Rows to scrub, carrying the EXACT bytes the classification saw. */
  readonly remediate: readonly { id: string; text: string }[];
}

/**
 * Classify one surface's rows. Shared so every surface uses ONE classification
 * path and no surface can drift into its own term list (AC-3).
 */
async function classifySurface(
  rows: readonly TextRow[],
  fieldKind: LearningTextFieldKind,
): Promise<SurfaceClassification> {
  const withText = rows.filter(
    (row): row is TextRow & { text: string } => typeof row.text === 'string',
  );
  if (withText.length === 0) {
    return { scanned: 0, review: 0, remediate: [] };
  }

  const verdicts = await classifyPersistedLearningText({
    fieldKind,
    rows: withText,
  });
  const textById = new Map(withText.map((row) => [row.id, row.text]));

  return {
    scanned: withText.length,
    review: verdicts.filter((verdict) => verdict.disposition === 'review')
      .length,
    remediate: verdicts
      .filter((verdict) => verdict.disposition === 'remediate')
      .map((verdict) => ({
        id: verdict.id,
        text: textById.get(verdict.id) as string,
      })),
  };
}

/**
 * Scrub one row, but ONLY if its text is still byte-identical to what the
 * classification saw.
 *
 * The scan and the write are separate statements, so a learner can save new,
 * safe content in between; a blind `WHERE id IN (…)` would overwrite it with a
 * redaction placeholder on the strength of a verdict about bytes that no longer
 * exist. Matching the original text in the WHERE clause makes the update a
 * compare-and-set: it applies to the text that was judged, or to nothing.
 *
 * Returns whether the row was actually updated.
 */
async function scrubIfUnchanged(
  run: () => Promise<{ rowCount?: number | null } | unknown[]>,
): Promise<boolean> {
  const result = await run();
  const affected = Array.isArray(result)
    ? result.length
    : (result?.rowCount ?? 0);
  return affected > 0;
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
  // scope-allow: system remediation job intentionally scans and scrubs across
  // all profiles; the sweep is defined by the offending text, not by an owner.
  const rows = await db
    .select({
      id: mentorNotices.id,
      concept: mentorNotices.concept,
      correctionHint: mentorNotices.correctionHint,
    })
    .from(mentorNotices);

  const concepts = await classifySurface(
    rows.map((row) => ({ id: row.id, text: row.concept })),
    'mentor_notice_concept',
  );

  let conceptsScrubbed = 0;
  for (const target of concepts.remediate) {
    const updated = await scrubIfUnchanged(() =>
      // scope-allow: guarded by the row id plus its exact prior text; the job is
      // deliberately cross-profile.
      db
        .update(mentorNotices)
        .set({ concept: REDACTED_PLACEHOLDER, status: 'faded' })
        .where(
          and(
            eq(mentorNotices.id, target.id),
            eq(mentorNotices.concept, target.text),
          ),
        )
        .returning({ id: mentorNotices.id }),
    );
    if (updated) conceptsScrubbed += 1;
  }

  const hints = await classifySurface(
    rows.map((row) => ({ id: row.id, text: row.correctionHint })),
    'mentor_notice_correction_hint',
  );

  let hintsScrubbed = 0;
  for (const target of hints.remediate) {
    const updated = await scrubIfUnchanged(() =>
      // scope-allow: guarded by the row id plus its exact prior text; the job is
      // deliberately cross-profile.
      db
        .update(mentorNotices)
        .set({ correctionHint: null })
        .where(
          and(
            eq(mentorNotices.id, target.id),
            eq(mentorNotices.correctionHint, target.text),
          ),
        )
        .returning({ id: mentorNotices.id }),
    );
    if (updated) hintsScrubbed += 1;
  }

  return [
    {
      surface: 'mentor_notices.concept',
      scanned: concepts.scanned,
      remediated: conceptsScrubbed,
      review: concepts.review,
      skippedChanged: concepts.remediate.length - conceptsScrubbed,
    },
    {
      surface: 'mentor_notices.correction_hint',
      scanned: hints.scanned,
      remediated: hintsScrubbed,
      review: hints.review,
      skippedChanged: hints.remediate.length - hintsScrubbed,
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
  // scope-allow: system remediation job intentionally scans and scrubs across
  // all profiles; the sweep is defined by the offending text, not by an owner.
  const rows = await db
    .select({ id: topicNotes.id, text: topicNotes.content })
    .from(topicNotes);

  const result = await classifySurface(rows, 'note_text');

  let scrubbed = 0;
  for (const target of result.remediate) {
    const updated = await scrubIfUnchanged(() =>
      // scope-allow: guarded by the row id plus its exact prior text; the job is
      // deliberately cross-profile.
      db
        .update(topicNotes)
        .set({ content: REDACTED_PLACEHOLDER })
        .where(
          and(
            eq(topicNotes.id, target.id),
            eq(topicNotes.content, target.text),
          ),
        )
        .returning({ id: topicNotes.id }),
    );
    if (updated) scrubbed += 1;
  }

  return {
    surface: 'topic_notes.content',
    scanned: result.scanned,
    remediated: scrubbed,
    review: result.review,
    skippedChanged: result.remediate.length - scrubbed,
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
  // scope-allow: system remediation job intentionally scans and scrubs across
  // all profiles; the sweep is defined by the offending text, not by an owner.
  const rows = await db
    .select({
      id: needsDeepeningTopics.id,
      text: needsDeepeningTopics.misconception,
    })
    .from(needsDeepeningTopics)
    .where(isNotNull(needsDeepeningTopics.misconception));

  const result = await classifySurface(rows, 'needs_deepening');

  let scrubbed = 0;
  for (const target of result.remediate) {
    const updated = await scrubIfUnchanged(() =>
      // scope-allow: guarded by the row id plus its exact prior text; the job is
      // deliberately cross-profile.
      db
        .update(needsDeepeningTopics)
        .set({ misconception: null })
        .where(
          and(
            eq(needsDeepeningTopics.id, target.id),
            eq(needsDeepeningTopics.misconception, target.text),
          ),
        )
        .returning({ id: needsDeepeningTopics.id }),
    );
    if (updated) scrubbed += 1;
  }

  return {
    surface: 'needs_deepening_topics.misconception',
    scanned: result.scanned,
    remediated: scrubbed,
    review: result.review,
    skippedChanged: result.remediate.length - scrubbed,
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
