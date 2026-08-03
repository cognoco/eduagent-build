import { and, eq, sql } from 'drizzle-orm';
import { learningProfiles, type Database } from '@eduagent/database';
import { classifyRowFields } from './persisted-remediation-fields';
import type {
  FieldText,
  MultiTextRow,
  RowFieldVerdicts,
  SurfaceRemediationReport,
} from './persisted-remediation-fields';
// Reused, not reimplemented (per the task brief): this is the SAME function
// `mergeInterests` / `buildDeleteMemoryItemUpdates` use to derive the
// `interest_timestamps` key from an interest's display text. If this module
// grew its own copy, a future edit to the normalization rule (trimming,
// casing) could silently diverge between the live write path and this
// backfill, leaving orphaned or mismatched timestamp keys behind.
import { normalizeMemoryValue } from '../learner-profile';

/**
 * [WI-2753 rework, E3] Remediate free text inside `learning_profiles` JSONB
 * columns — interests, strengths, struggles, communicationNotes,
 * suppressedInferences, recentlyResolvedTopics.
 *
 * WHY `learningStyle` IS NOT HERE. Every field of `learningStyleSchema`
 * (packages/schemas/src/learning-profiles.ts) is an enum, a number, or a
 * `source` enum — `preferredExplanations`, `pacePreference`,
 * `responseToChallenge`, `confidence`, `corroboratingSessions`, `source`.
 * There is no free text in the column at all, so there is nothing for the
 * gate to classify; scanning it would be a no-op that only cost a batch.
 *
 * WHY ONE UPDATE PER ROW, NOT ONE PER COLUMN. All six columns live on the
 * SAME row and share the SAME `version` counter. Six independent
 * CAS-guarded UPDATEs per row (matching persisted-remediation-apply.ts's
 * one-UPDATE-per-surface-value shape) would race each other: the first
 * write bumps `version`, so the second write's guard — built from the same
 * pre-write read — would spuriously miss even though nothing external
 * changed the row. Folding every column this row needs into ONE guarded
 * UPDATE keeps the CAS guard meaningful: it only ever misses because of a
 * concurrent WRITER, never because of this job's own previous statement.
 * The cost is that `remediated` / `skippedChanged` are reported per ROW per
 * COLUMN, not per changed VALUE — documented on each counter below.
 *
 * WHY NO RETRY LOOP. Same reasoning as the four scalar surfaces: a version
 * that moved between this job's read and its write means a learner (or
 * another analysis run) touched the row in between, and the CURRENT bytes
 * were never classified. Retrying blind would either reclassify a live
 * profile mid-backfill or paper over a live concurrent write. A future run
 * reclassifies whatever is there now — `skippedChanged` keeps that fact
 * visible instead of silently under-reporting `remediated`, exactly as
 * `scrubIfUnchanged` documents for the scalar surfaces.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Local re-derivation of `asInterestTimestampMap` in learner-profile.ts.
 * NOT the same kind of reuse obligation as `normalizeMemoryValue` — this is a
 * three-line "is this a plain object" type guard with no rule inside it that
 * could drift; the brief's "reuse, don't reimplement" concern is about the
 * NORMALIZATION function, which this module does import. See the trailing
 * notes for the explicit reasoning.
 */
function asInterestTimestampMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return value as Record<string, string>;
}

// ---------------------------------------------------------------------------
// interests — InterestEntry[] (`{ label, context }`) per schema, but
// `buildAnalysisUpdates` (learner-profile.ts, via `mergeInterests`) still
// writes bare `string[]` on the session-analysis path today — the
// InterestEntry reshape (BKT-C.2) only normalizes on READ via a Zod
// preprocessor, not on write. So a live row can hold a MIX of both shapes.
// Every element is therefore checked defensively, matching the same
// `typeof i === 'string' ? … : i.label` coercion `buildMemoryBlock` already
// uses. `.context` is an enum — never scanned.
// ---------------------------------------------------------------------------

interface DescribedField {
  readonly path: string;
  readonly text: string | undefined;
}

function describeInterests(elements: readonly unknown[]): DescribedField[] {
  return elements.map((el, i) => {
    if (typeof el === 'string') {
      return { path: `interests.${i}`, text: el };
    }
    if (isRecord(el) && typeof el.label === 'string') {
      return { path: `interests.${i}.label`, text: el.label };
    }
    return { path: `interests.${i}`, text: undefined };
  });
}

/**
 * Drop a flagged interests entry outright (its ONLY free text, `.label`, is
 * what was flagged — there is nothing left worth keeping the entry for) and
 * remove its orphaned `interestTimestamps` key in the SAME pass, using the
 * value that was actually classified (the label/string as it existed before
 * removal) so the normalized key matches exactly what the live write path
 * would have produced for it.
 */
function applyInterestsVerdict(
  elements: readonly unknown[],
  remediateSet: ReadonlySet<string>,
  timestamps: Record<string, string>,
): {
  interests: unknown[];
  interestTimestamps: Record<string, string>;
  changed: boolean;
} {
  const described = describeInterests(elements);
  const nextTimestamps = { ...timestamps };
  const kept: unknown[] = [];
  let changed = false;

  elements.forEach((el, i) => {
    const field = described[i];
    if (
      field &&
      remediateSet.has(field.path) &&
      typeof field.text === 'string'
    ) {
      changed = true;
      delete nextTimestamps[normalizeMemoryValue(field.text)];
      return;
    }
    kept.push(el);
  });

  return { interests: kept, interestTimestamps: nextTimestamps, changed };
}

// ---------------------------------------------------------------------------
// strengths — StrengthEntry[]. `.subject` is the primary text (entry is
// meaningless without it — it's the thing the learner is strong AT);
// `.topics[]` are secondary (dropping one topic leaves a smaller, still
// meaningful entry). Non-object elements and non-array `.topics` are left
// untouched: this job redacts flagged TEXT, it does not repair or drop rows
// that already violate the schema for unrelated reasons.
// ---------------------------------------------------------------------------

const strengthSubjectPath = (i: number): string => `strengths.${i}.subject`;
const strengthTopicPath = (i: number, j: number): string =>
  `strengths.${i}.topics.${j}`;

function buildStrengthsFields(elements: readonly unknown[]): FieldText[] {
  const fields: FieldText[] = [];
  elements.forEach((el, i) => {
    if (!isRecord(el)) return;
    if (typeof el.subject === 'string') {
      fields.push({ path: strengthSubjectPath(i), text: el.subject });
    }
    asArray(el.topics).forEach((topic, j) => {
      if (typeof topic === 'string') {
        fields.push({ path: strengthTopicPath(i, j), text: topic });
      }
    });
  });
  return fields;
}

function applyStrengthsVerdict(
  elements: readonly unknown[],
  remediateSet: ReadonlySet<string>,
): { value: unknown[]; changed: boolean } {
  let changed = false;
  const kept: unknown[] = [];

  elements.forEach((el, i) => {
    if (!isRecord(el)) {
      kept.push(el);
      return;
    }
    if (
      typeof el.subject === 'string' &&
      remediateSet.has(strengthSubjectPath(i))
    ) {
      changed = true;
      return; // whole entry dropped — subject is what the entry IS
    }
    const topics = Array.isArray(el.topics) ? el.topics : null;
    if (topics === null) {
      kept.push(el);
      return;
    }
    const nextTopics = topics.filter((topic, j) => {
      if (
        typeof topic === 'string' &&
        remediateSet.has(strengthTopicPath(i, j))
      ) {
        changed = true;
        return false;
      }
      return true;
    });
    kept.push(
      nextTopics.length === topics.length ? el : { ...el, topics: nextTopics },
    );
  });

  return { value: kept, changed };
}

// ---------------------------------------------------------------------------
// struggles — FocusAreaEntry[]. `.topic` is required and primary; `.subject`
// is nullable and secondary — flagging it nulls just that field (matching
// the existing `deleteMemoryItem` precedent of nulling a nullable field
// rather than destroying the entry it sits on).
// ---------------------------------------------------------------------------

const struggleSubjectPath = (i: number): string => `struggles.${i}.subject`;
const struggleTopicPath = (i: number): string => `struggles.${i}.topic`;

function buildStrugglesFields(elements: readonly unknown[]): FieldText[] {
  const fields: FieldText[] = [];
  elements.forEach((el, i) => {
    if (!isRecord(el)) return;
    if (typeof el.subject === 'string') {
      fields.push({ path: struggleSubjectPath(i), text: el.subject });
    }
    if (typeof el.topic === 'string') {
      fields.push({ path: struggleTopicPath(i), text: el.topic });
    }
  });
  return fields;
}

function applyStrugglesVerdict(
  elements: readonly unknown[],
  remediateSet: ReadonlySet<string>,
): { value: unknown[]; changed: boolean } {
  let changed = false;
  const kept: unknown[] = [];

  elements.forEach((el, i) => {
    if (!isRecord(el)) {
      kept.push(el);
      return;
    }
    if (
      typeof el.topic === 'string' &&
      remediateSet.has(struggleTopicPath(i))
    ) {
      changed = true;
      return; // whole entry dropped — topic is required, entry is meaningless without it
    }
    if (
      typeof el.subject === 'string' &&
      remediateSet.has(struggleSubjectPath(i))
    ) {
      changed = true;
      kept.push({ ...el, subject: null });
      return;
    }
    kept.push(el);
  });

  return { value: kept, changed };
}

// ---------------------------------------------------------------------------
// communicationNotes / suppressedInferences — plain string[]. No structure
// to preserve, so a flagged element is dropped outright (a redaction
// placeholder in a list of free-form notes would just be noise).
// ---------------------------------------------------------------------------

function buildStringArrayFields(
  column: string,
  elements: readonly unknown[],
): FieldText[] {
  const fields: FieldText[] = [];
  elements.forEach((el, i) => {
    if (typeof el === 'string')
      fields.push({ path: `${column}.${i}`, text: el });
  });
  return fields;
}

function applyStringArrayVerdict(
  column: string,
  elements: readonly unknown[],
  remediateSet: ReadonlySet<string>,
): { value: unknown[]; changed: boolean } {
  let changed = false;
  const kept = elements.filter((el, i) => {
    if (typeof el === 'string' && remediateSet.has(`${column}.${i}`)) {
      changed = true;
      return false;
    }
    return true;
  });
  return { value: kept, changed };
}

// ---------------------------------------------------------------------------
// recentlyResolvedTopics — the brief describes this column as plain
// `string[]`, matching `learningProfileSchema` (packages/schemas). The
// LIVE write path disagrees: `buildAnalysisUpdates` (learner-profile.ts)
// writes `{ topic, subject: string | null }` objects, and
// `session-exchange.ts` reads the column as
// `Array<string | { topic: string; subject: string | null }>` — legacy rows
// may still hold bare strings, current rows hold objects. This module
// checks BOTH shapes defensively (bare string, or `.topic` / `.subject` of
// an object) but — because the brief gives this column no per-field
// preservation rule the way it does for struggles.subject — treats EITHER
// half of an object element being flagged as reason to drop the WHOLE
// element, the same "no structure worth partially preserving" policy as the
// plain-string-array columns. Flagged in the trailing notes as a real
// discrepancy between the brief and the schema, not a case the brief
// anticipated.
// ---------------------------------------------------------------------------

const recentlyResolvedBarePath = (i: number): string =>
  `recentlyResolvedTopics.${i}`;
const recentlyResolvedTopicPath = (i: number): string =>
  `recentlyResolvedTopics.${i}.topic`;
const recentlyResolvedSubjectPath = (i: number): string =>
  `recentlyResolvedTopics.${i}.subject`;

function buildRecentlyResolvedFields(
  elements: readonly unknown[],
): FieldText[] {
  const fields: FieldText[] = [];
  elements.forEach((el, i) => {
    if (typeof el === 'string') {
      fields.push({ path: recentlyResolvedBarePath(i), text: el });
      return;
    }
    if (!isRecord(el)) return;
    if (typeof el.topic === 'string') {
      fields.push({ path: recentlyResolvedTopicPath(i), text: el.topic });
    }
    if (typeof el.subject === 'string') {
      fields.push({ path: recentlyResolvedSubjectPath(i), text: el.subject });
    }
  });
  return fields;
}

function applyRecentlyResolvedVerdict(
  elements: readonly unknown[],
  remediateSet: ReadonlySet<string>,
): { value: unknown[]; changed: boolean } {
  let changed = false;
  const kept = elements.filter((el, i) => {
    if (typeof el === 'string') {
      if (remediateSet.has(recentlyResolvedBarePath(i))) {
        changed = true;
        return false;
      }
      return true;
    }
    if (!isRecord(el)) return true;
    const topicFlagged =
      typeof el.topic === 'string' &&
      remediateSet.has(recentlyResolvedTopicPath(i));
    const subjectFlagged =
      typeof el.subject === 'string' &&
      remediateSet.has(recentlyResolvedSubjectPath(i));
    if (topicFlagged || subjectFlagged) {
      changed = true;
      return false;
    }
    return true;
  });
  return { value: kept, changed };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

interface LearnerProfileFreeTextRow {
  readonly id: string;
  readonly version: number;
  readonly interests: unknown;
  readonly interestTimestamps: unknown;
  readonly strengths: unknown;
  readonly struggles: unknown;
  readonly communicationNotes: unknown;
  readonly suppressedInferences: unknown;
  readonly recentlyResolvedTopics: unknown;
}

function byId<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

/** Rows with at least one candidate string for this column — matches the
 * scalar surfaces' `scanned = withText.length`, one level down (per-row,
 * not per-value). */
function scannedRowCount(rows: readonly MultiTextRow[]): number {
  return rows.filter((row) =>
    row.fields.some((f) => typeof f.text === 'string'),
  ).length;
}

/** Rows the gate blocked as `review` on at least one field for this column —
 * counted from classification alone, independent of whether the row was
 * ALSO written for a different, remediated field. */
function reviewRowCount(verdicts: readonly RowFieldVerdicts[]): number {
  return verdicts.filter((v) => v.review.length > 0).length;
}

export async function remediateLearnerProfileFreeText(
  db: Database,
): Promise<SurfaceRemediationReport[]> {
  // scope-allow: system remediation job intentionally scans and scrubs across
  // all profiles; the sweep is defined by the offending text, not by an owner.
  const rows: LearnerProfileFreeTextRow[] = await db
    .select({
      id: learningProfiles.id,
      version: learningProfiles.version,
      interests: learningProfiles.interests,
      interestTimestamps: learningProfiles.interestTimestamps,
      strengths: learningProfiles.strengths,
      struggles: learningProfiles.struggles,
      communicationNotes: learningProfiles.communicationNotes,
      suppressedInferences: learningProfiles.suppressedInferences,
      recentlyResolvedTopics: learningProfiles.recentlyResolvedTopics,
    })
    .from(learningProfiles);

  // Raw element arrays, computed once per row and reused for both the
  // classify-input build below and the apply step after classification —
  // avoids re-deriving (and risking drift in) the shape coercion twice.
  const interestsByRow = new Map<string, unknown[]>();
  const strengthsByRow = new Map<string, unknown[]>();
  const strugglesByRow = new Map<string, unknown[]>();
  const notesByRow = new Map<string, unknown[]>();
  const suppressedByRow = new Map<string, unknown[]>();
  const recentByRow = new Map<string, unknown[]>();

  const interestsRows: MultiTextRow[] = [];
  const strengthsRows: MultiTextRow[] = [];
  const strugglesRows: MultiTextRow[] = [];
  const notesRows: MultiTextRow[] = [];
  const suppressedRows: MultiTextRow[] = [];
  const recentRows: MultiTextRow[] = [];

  for (const row of rows) {
    const interests = asArray(row.interests);
    const strengths = asArray(row.strengths);
    const struggles = asArray(row.struggles);
    const communicationNotes = asArray(row.communicationNotes);
    const suppressedInferences = asArray(row.suppressedInferences);
    const recentlyResolvedTopics = asArray(row.recentlyResolvedTopics);

    interestsByRow.set(row.id, interests);
    strengthsByRow.set(row.id, strengths);
    strugglesByRow.set(row.id, struggles);
    notesByRow.set(row.id, communicationNotes);
    suppressedByRow.set(row.id, suppressedInferences);
    recentByRow.set(row.id, recentlyResolvedTopics);

    interestsRows.push({ id: row.id, fields: describeInterests(interests) });
    strengthsRows.push({ id: row.id, fields: buildStrengthsFields(strengths) });
    strugglesRows.push({ id: row.id, fields: buildStrugglesFields(struggles) });
    notesRows.push({
      id: row.id,
      fields: buildStringArrayFields('communicationNotes', communicationNotes),
    });
    suppressedRows.push({
      id: row.id,
      fields: buildStringArrayFields(
        'suppressedInferences',
        suppressedInferences,
      ),
    });
    recentRows.push({
      id: row.id,
      fields: buildRecentlyResolvedFields(recentlyResolvedTopics),
    });
  }

  // ONE classify call per column, each batched across every language and
  // every row for that column — the same shape as the four scalar surfaces'
  // one-classifySurface-call-per-column, one level down (per field, not per
  // row-text). Run concurrently: each call is a pure read-and-score with no
  // side effects, so there is nothing for them to race against.
  const [
    interestsVerdicts,
    strengthsVerdicts,
    strugglesVerdicts,
    notesVerdicts,
    suppressedVerdicts,
    recentVerdicts,
  ] = await Promise.all([
    classifyRowFields({
      fieldKind: 'learner_profile_field',
      rows: interestsRows,
    }),
    classifyRowFields({
      fieldKind: 'learner_profile_field',
      rows: strengthsRows,
    }),
    classifyRowFields({
      fieldKind: 'learner_profile_field',
      rows: strugglesRows,
    }),
    classifyRowFields({ fieldKind: 'learner_profile_field', rows: notesRows }),
    classifyRowFields({
      fieldKind: 'learner_profile_field',
      rows: suppressedRows,
    }),
    classifyRowFields({ fieldKind: 'learner_profile_field', rows: recentRows }),
  ]);

  const interestsById = byId(interestsVerdicts);
  const strengthsById = byId(strengthsVerdicts);
  const strugglesById = byId(strugglesVerdicts);
  const notesById = byId(notesVerdicts);
  const suppressedById = byId(suppressedVerdicts);
  const recentById = byId(recentVerdicts);

  let interestsRemediated = 0;
  let interestsSkipped = 0;
  let strengthsRemediated = 0;
  let strengthsSkipped = 0;
  let strugglesRemediated = 0;
  let strugglesSkipped = 0;
  let notesRemediated = 0;
  let notesSkipped = 0;
  let suppressedRemediated = 0;
  let suppressedSkipped = 0;
  let recentRemediated = 0;
  let recentSkipped = 0;

  for (const row of rows) {
    const interestVerdict = interestsById.get(row.id);
    const strengthVerdict = strengthsById.get(row.id);
    const struggleVerdict = strugglesById.get(row.id);
    const noteVerdict = notesById.get(row.id);
    const suppressedVerdict = suppressedById.get(row.id);
    const recentVerdict = recentById.get(row.id);

    const updates: Record<string, unknown> = {};
    let touchesInterests = false;
    let touchesStrengths = false;
    let touchesStruggles = false;
    let touchesNotes = false;
    let touchesSuppressed = false;
    let touchesRecent = false;

    if (interestVerdict && interestVerdict.remediate.length > 0) {
      const result = applyInterestsVerdict(
        interestsByRow.get(row.id) ?? [],
        new Set(interestVerdict.remediate),
        asInterestTimestampMap(row.interestTimestamps),
      );
      if (result.changed) {
        updates.interests = result.interests;
        updates.interestTimestamps = result.interestTimestamps;
        touchesInterests = true;
      }
    }

    if (strengthVerdict && strengthVerdict.remediate.length > 0) {
      const result = applyStrengthsVerdict(
        strengthsByRow.get(row.id) ?? [],
        new Set(strengthVerdict.remediate),
      );
      if (result.changed) {
        updates.strengths = result.value;
        touchesStrengths = true;
      }
    }

    if (struggleVerdict && struggleVerdict.remediate.length > 0) {
      const result = applyStrugglesVerdict(
        strugglesByRow.get(row.id) ?? [],
        new Set(struggleVerdict.remediate),
      );
      if (result.changed) {
        updates.struggles = result.value;
        touchesStruggles = true;
      }
    }

    if (noteVerdict && noteVerdict.remediate.length > 0) {
      const result = applyStringArrayVerdict(
        'communicationNotes',
        notesByRow.get(row.id) ?? [],
        new Set(noteVerdict.remediate),
      );
      if (result.changed) {
        updates.communicationNotes = result.value;
        touchesNotes = true;
      }
    }

    if (suppressedVerdict && suppressedVerdict.remediate.length > 0) {
      const result = applyStringArrayVerdict(
        'suppressedInferences',
        suppressedByRow.get(row.id) ?? [],
        new Set(suppressedVerdict.remediate),
      );
      if (result.changed) {
        updates.suppressedInferences = result.value;
        touchesSuppressed = true;
      }
    }

    if (recentVerdict && recentVerdict.remediate.length > 0) {
      const result = applyRecentlyResolvedVerdict(
        recentByRow.get(row.id) ?? [],
        new Set(recentVerdict.remediate),
      );
      if (result.changed) {
        updates.recentlyResolvedTopics = result.value;
        touchesRecent = true;
      }
    }

    if (Object.keys(updates).length === 0) continue;

    // `version` (not byte-equality on a JSONB blob) is the compare-and-set key
    // here — cheaper to compare, and the column already exists on this table
    // for exactly this purpose.
    // scope-allow: guarded by the row id plus its exact prior version; the job is
    // deliberately cross-profile.
    const written = await db
      .update(learningProfiles)
      .set({
        ...updates,
        version: sql`${learningProfiles.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(learningProfiles.id, row.id),
          eq(learningProfiles.version, row.version),
        ),
      )
      .returning({ id: learningProfiles.id });

    const ok = written.length > 0;
    if (touchesInterests) {
      if (ok) interestsRemediated += 1;
      else interestsSkipped += 1;
    }
    if (touchesStrengths) {
      if (ok) strengthsRemediated += 1;
      else strengthsSkipped += 1;
    }
    if (touchesStruggles) {
      if (ok) strugglesRemediated += 1;
      else strugglesSkipped += 1;
    }
    if (touchesNotes) {
      if (ok) notesRemediated += 1;
      else notesSkipped += 1;
    }
    if (touchesSuppressed) {
      if (ok) suppressedRemediated += 1;
      else suppressedSkipped += 1;
    }
    if (touchesRecent) {
      if (ok) recentRemediated += 1;
      else recentSkipped += 1;
    }
  }

  return [
    {
      surface: 'learning_profiles.interests',
      scanned: scannedRowCount(interestsRows),
      remediated: interestsRemediated,
      review: reviewRowCount(interestsVerdicts),
      skippedChanged: interestsSkipped,
    },
    {
      surface: 'learning_profiles.strengths',
      scanned: scannedRowCount(strengthsRows),
      remediated: strengthsRemediated,
      review: reviewRowCount(strengthsVerdicts),
      skippedChanged: strengthsSkipped,
    },
    {
      surface: 'learning_profiles.struggles',
      scanned: scannedRowCount(strugglesRows),
      remediated: strugglesRemediated,
      review: reviewRowCount(strugglesVerdicts),
      skippedChanged: strugglesSkipped,
    },
    {
      surface: 'learning_profiles.communication_notes',
      scanned: scannedRowCount(notesRows),
      remediated: notesRemediated,
      review: reviewRowCount(notesVerdicts),
      skippedChanged: notesSkipped,
    },
    {
      surface: 'learning_profiles.suppressed_inferences',
      scanned: scannedRowCount(suppressedRows),
      remediated: suppressedRemediated,
      review: reviewRowCount(suppressedVerdicts),
      skippedChanged: suppressedSkipped,
    },
    {
      surface: 'learning_profiles.recently_resolved_topics',
      scanned: scannedRowCount(recentRows),
      remediated: recentRemediated,
      review: reviewRowCount(recentVerdicts),
      skippedChanged: recentSkipped,
    },
  ];
}

// ---------------------------------------------------------------------------
// Trailing notes (per request: be honest about gaps, don't guess confidently)
// ---------------------------------------------------------------------------
//
// 1. THINGS I WAS UNSURE ABOUT
//
//    - Per-row vs per-value report counting. The brief says "scanned counts
//      rows examined for that column" but doesn't spell out remediated/review
//      granularity for a row that can carry MANY values per column. I chose
//      per-ROW counting throughout (a row counts once per column, regardless
//      of how many of its values in that column were flagged), to match the
//      report's row-shaped precedent in persisted-remediation-apply.ts. An
//      owner who wants per-VALUE counts (e.g. "3 topics scrubbed across 2
//      rows" rather than "2 rows had a scrub") would need a different
//      SurfaceRemediationReport shape or an additional field — I did not
//      invent one since the brief said to reuse the existing type as-is.
//
//    - ONE combined UPDATE per row (covering every column that row needs
//      changed) rather than six independent CAS updates. I believe this is
//      the correct reading of "don't invent a new compare-and-set" — it
//      reuses the SAME `version`-guard idea, just scoped to the row rather
//      than the value, which is necessary because six independent writes to
//      the same row would race each other's version bump. But it does mean a
//      row that has a remediable value in TWO columns is only given ONE
//      shot at the CAS guard, not two — if it misses, BOTH columns count a
//      `skippedChanged` for that row even though, value-for-value, nothing
//      about interests specifically conflicted. I could not verify this
//      against a database, so I could not confirm the combined UPDATE's
//      typing/shape actually executes — only that it mirrors the existing
//      `.set({...updates, version: sql\`...\`, ...})` idiom already used
//      unmodified in `learner-profile.ts` (buildAnalysisUpdates' call site).
//
//    - `strengths.topics[]` reaching empty after every element is scrubbed.
//      The brief says "drop that element" for a flagged topic but says
//      nothing about what happens when ALL topics of an entry are gone. I
//      left the entry in place with `topics: []` rather than dropping the
//      whole entry — the brief only authorizes whole-entry removal when the
//      PRIMARY text (`.subject`) is flagged, so I did not extend that to an
//      emptied secondary array. Flagging this because an entry with zero
//      topics may not be meaningful downstream (I did not check every reader
//      of `strengths` for that assumption).
//
// 2. DERIVED-CARRIER QUESTIONS I ASKED, AND THEIR ANSWERS
//
//    - Is anything else on the row keyed by or derived from `interests`?
//      YES — `interestTimestamps` (Record<normalizedLabel, ISOTimestamp>).
//      Handled: every dropped interests entry deletes its matching
//      `interestTimestamps` key via the SAME `normalizeMemoryValue` the live
//      write path uses (imported from `../learner-profile`, not
//      reimplemented).
//
//    - Is anything keyed by or derived from `strengths.subject`,
//      `strengths.topics[]`, `struggles.subject`, or `struggles.topic`? NO —
//      grepped `learner-profile.ts` and `memory/projection.ts`; both are read
//      and matched against at RUNTIME (`sameNormalized` lookups during merge)
//      but nothing else on the `learning_profiles` row stores a value keyed
//      by them the way `interestTimestamps` is keyed by interests.
//
//    - Is anything keyed by `communicationNotes`, `suppressedInferences`, or
//      `recentlyResolvedTopics`? NO for all three — `suppressedInferences`
//      is itself consulted (as a suppression set) by the merge functions for
//      interests/strengths/struggles, but nothing stores a value keyed off
//      one of ITS entries, so removing an entry from it orphans nothing.
//
//    - Is `version` itself a derived carrier I needed to protect? Yes in the
//      sense that it's the concurrency guard, not free text — handled by
//      using it as the CAS key rather than scanning or modifying it.
//
// 3. THINGS I COULD NOT VERIFY BY READING
//
//    - Whether `recentlyResolvedTopics` genuinely still contains legacy bare
//      strings in production, or whether every row has already been
//      overwritten by the object-shaped write path by now. I found BOTH
//      shapes are code-supported (`session-exchange.ts` reads
//      `Array<string | { topic, subject }>`) but could not query the
//      database to confirm which shape is actually live today. This module
//      handles both regardless, so it should be safe either way, but I want
//      this flagged: the brief characterized this column as plain
//      `string[]`, and that characterization does not match
//      `buildAnalysisUpdates`'s write shape (`{ topic, subject }` objects) —
//      a real discrepancy between the brief and the code, not a case the
//      brief anticipated. Same caveat applies to `interests` possibly still
//      holding bare strings from the same live write path
//      (`mergeInterests` in `learner-profile.ts` still returns `string[]`,
//      not `InterestEntry[]`, despite the BKT-C.2 schema reshape being read-
//      side only).
//
//    - Whether `classifyRowFields`'s per-field composite id
//      (`${rowId}#${path}`) tolerates the `.` characters I used inside
//      `path` (e.g. `strengths.3.topics.1`). Reading
//      `persisted-remediation-fields.ts`, the split logic only looks for the
//      FIRST `#`, so any characters in `path` — including `.` — should be
//      safe; I could not run it to confirm empirically.
//
//    - Whether the combined `db.update(learningProfiles).set({...updates,
//      version: sql\`...\`, updatedAt: new Date()})` type-checks under this
//      package's drizzle/TypeScript config. It mirrors an existing call site
//      byte-for-byte in shape (`learner-profile.ts`'s `buildAnalysisUpdates`
//      write), but I have no way to run `tsc` from here.
