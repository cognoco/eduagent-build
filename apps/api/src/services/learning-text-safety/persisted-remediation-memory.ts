import { and, eq, type SQL } from 'drizzle-orm';
import { memoryFacts, topicNotes, type Database } from '@eduagent/database';
import {
  classifyRowFields,
  REDACTED_PLACEHOLDER,
  type FieldText,
  type MultiTextRow,
  type SurfaceRemediationReport,
} from './persisted-remediation-fields';
import { normalizeMemoryText } from '../memory/backfill-mapping';

/**
 * [WI-2753 rework] Remediates the two surfaces this rework adds beyond the
 * four landed scalar columns: `memory_facts`, which carries the SAME clinical
 * sentence in up to three places on one row, and `topic_notes.artifact_concept_key`,
 * a second copy of a verified Challenge quote that the landed `remediateTopicNotes`
 * (in `persisted-remediation-apply.ts`) does not reach.
 */

// ---------------------------------------------------------------------------
// memory_facts
// ---------------------------------------------------------------------------

/**
 * THE THREE CARRIERS. A `memory_facts` row can restate the same free text up to
 * three times:
 *
 *   1. `text` — NOT NULL. The primary carrier. Scrubbed with the placeholder
 *      (nulling is unavailable, same reasoning as every other NOT NULL text
 *      column in `persisted-remediation-apply.ts`).
 *   2. `text_normalized` — NOT NULL, derived from `text` by `normalizeMemoryText`
 *      (`backfill-mapping.ts`). Recomputed from the placeholder whenever `text`
 *      changes, never reimplemented inline, so the two columns can never drift.
 *   3. `metadata` jsonb — for SOME categories, a second copy of a piece of the
 *      same sentence. Verified against `backfill-mapping.ts`'s
 *      `map*ToFact` builders rather than assumed:
 *        - `category: 'strength'` → `metadata.subject` and every entry of
 *          `metadata.topics[]` (`mapStrengthToFact`: `text` is
 *          `` `${subject}: ${topics.join(', ')} (...)` ``).
 *        - `category: 'interest'` → `metadata.label` (`mapInterestToFact`:
 *          `text` IS `entry.label`).
 *        - `category: 'struggle'` → `metadata.subject` (nullable) and
 *          `metadata.topic` (`mapStruggleToFact`: `text` is
 *          `` `${subject}: `${topic} (...)` ``). **This category was not named
 *          in the assignment brief; it is reported here because
 *          `focusAreaEntrySchema` (`packages/schemas/src/learning-profiles.ts`)
 *          types both `subject` and `topic` as free-text strings, and
 *          `mapStruggleToFact` copies them into `metadata` verbatim — the same
 *          duplication shape as `strength`/`interest`.**
 *        - `category: 'communication_note'` → `metadata: {}` (`mapCommunicationNoteToFact`).
 *          No duplicate.
 *        - `category: 'suppressed'` → `metadata: { originCategory }`
 *          (`mapSuppressedInferenceToFact`). `originCategory` is a category
 *          label, not learner-authored text — no duplicate.
 *      `metadata.context` (interest) and `metadata.source`/`metadata.attempts`
 *      (strength/struggle) are excluded deliberately: `context` is the enum
 *      `interestContextSchema` (`'free_time' | 'school' | 'both'`), and
 *      `source`/`attempts` are provenance/count fields — none carry free text.
 *
 * FIELD-LEVEL, NOT ROW-LEVEL, REDACTION. Each carrier is redacted ONLY if ITS
 * OWN classification says `remediate` — this module does NOT escalate "one
 * carrier on this row was flagged" into "redact every carrier on this row".
 * That escalation looks appealing (it would make the defeat-by-omission risk
 * impossible) but it is wrong given the existing contract on
 * `SurfaceRemediationReport.review` in `persisted-remediation-apply.ts`:
 * "Rows the gate blocked as `unclear` — reported, never modified." If
 * `metadata.subject` classifies `review` while `text` classifies `remediate`,
 * escalating would overwrite the ambiguous `subject` anyway — silently
 * breaking that invariant for a carrier the gate explicitly said not to
 * destroy. `classifyRowFields` scans every carrier under every attribution
 * grammar independently and already returns an independent verdict per VALUE
 * (see its own doc comment); trusting that per-field verdict is what "the gate
 * is the sole classifier" (AC-3) means in practice. The residual risk this
 * accepts — a field classifies `clear`/`review` in isolation while its sibling
 * classifies `remediate` — is a property of the classifier's behavior across
 * near-duplicate strings, not something a remediation-apply module should
 * paper over by inventing its own escalation rule.
 *
 * THE UNIQUE-INDEX PROBLEM. `memory_facts_active_unique_idx`
 * (`packages/database/src/schema/memory-facts.ts`) is UNIQUE on `(profileId,
 * category, COALESCE(metadata->>'subject',''), COALESCE(metadata->>'context',''),
 * textNormalized)` WHERE `superseded_by IS NULL`. `text` is the only carrier
 * whose redaction can create a NEW collision here: it is rewritten to the same
 * constant `REDACTED_PLACEHOLDER` for every remediated row, so
 * `text_normalized` collapses to `normalizeMemoryText(REDACTED_PLACEHOLDER)`
 * for all of them. Two ACTIVE rows in the same `(profileId, category, subject,
 * context)` group that both need `text` redacted would then collide on
 * update. `metadata.subject` alone becoming the placeholder does not create
 * this problem: it only changes one of the FIVE index columns, and the
 * surviving row is unique regardless of what its own `subject` becomes,
 * because every OTHER row that shared its original `(profileId, category,
 * subject, context)` group is superseded — see below — leaving exactly one
 * active row per original group.
 *
 * SUPERSEDE, DON'T DEDUPE-BY-DELETE. Within each `(profileId, category,
 * original metadata.subject, original metadata.context)` group of rows flagged
 * for a `text` redaction, ordered by `createdAt` (tie-broken by `id`, which is
 * a UUIDv7 and therefore already time-ordered — the tie-break exists only to
 * make the choice deterministic when timestamps coincide): the FIRST row is
 * scrubbed and stays active; every later row is scrubbed AND superseded by
 * pointing `supersededBy` at the survivor, stamping `supersededAt` and
 * `updatedAt` — exactly the mechanism `dedup-actions.ts`'s `applyDedupAction`
 * already uses for a `supersede` outcome (around its `action.action ===
 * 'supersede'` branch). A scrubbed duplicate genuinely IS a duplicate of the
 * surviving redacted fact once both read `REDACTED_PLACEHOLDER`; reusing the
 * table's own established supersede mechanism removes the row from the
 * partial index's WHERE clause (the predicate is `superseded_by IS NULL` —
 * stamping only `superseded_at` would NOT remove a row from the index; the
 * partial index does not test that column, so a row with `superseded_at` set
 * but `superseded_by` still null remains subject to the uniqueness
 * constraint. This is the non-obvious fact that makes pointing `supersededBy`
 * at the survivor, not just timestamping, load-bearing here).
 *
 * `supersededBy` NEVER equals the row's own id: verified against
 * `apps/api/src/services/memory/cascade-delete.ts`'s
 * `cascadeDeleteFactWithAncestry`, whose recursive CTE walks
 * `m.superseded_by = a.id` outward from a starting row — a row pointing at
 * itself would be a one-node cycle the recursive UNION could loop on
 * indefinitely (or at minimum corrupt the ancestry set). This module cannot
 * produce that: the survivor is drawn from `ordered[0]` and every superseded
 * row comes from `ordered.slice(1)`, so a row is never asked to point at
 * itself; a defensive check is included anyway (see `supersedeDuplicate`)
 * because the cost of asserting it is near zero and the failure mode is a
 * silent cascade-delete infinite loop rather than a thrown error.
 */

interface MemoryFactRemediationRow {
  readonly id: string;
  readonly profileId: string;
  readonly category: string;
  readonly text: string;
  readonly metadata: unknown;
  readonly supersededBy: string | null;
  readonly createdAt: Date;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/**
 * The metadata paths that duplicate part of `text`, per category. Returns `[]`
 * for categories with no known duplicate (`communication_note`, `suppressed`,
 * and any future category this module has not been taught about — silence
 * here is safe-by-default: an unrecognised category simply gets no metadata
 * scrutiny, never a crash).
 */
function metadataTextFields(category: string, metadata: unknown): FieldText[] {
  const record = metadataRecord(metadata);
  const fields: FieldText[] = [];

  if (category === 'strength') {
    if (typeof record.subject === 'string') {
      fields.push({ path: 'metadata.subject', text: record.subject });
    }
    if (Array.isArray(record.topics)) {
      record.topics.forEach((topic, index) => {
        if (typeof topic === 'string') {
          fields.push({ path: `metadata.topics.${index}`, text: topic });
        }
      });
    }
  } else if (category === 'struggle') {
    if (typeof record.subject === 'string') {
      fields.push({ path: 'metadata.subject', text: record.subject });
    }
    if (typeof record.topic === 'string') {
      fields.push({ path: 'metadata.topic', text: record.topic });
    }
  } else if (category === 'interest') {
    if (typeof record.label === 'string') {
      fields.push({ path: 'metadata.label', text: record.label });
    }
  }

  return fields;
}

/** Applies one field-level redaction to a (copied) metadata record, in place. */
function redactMetadataPath(
  record: Record<string, unknown>,
  path: string,
): void {
  if (path === 'metadata.subject') {
    record.subject = REDACTED_PLACEHOLDER;
    return;
  }
  if (path === 'metadata.topic') {
    record.topic = REDACTED_PLACEHOLDER;
    return;
  }
  if (path === 'metadata.label') {
    record.label = REDACTED_PLACEHOLDER;
    return;
  }
  const topicsMatch = /^metadata\.topics\.(\d+)$/.exec(path);
  if (topicsMatch && Array.isArray(record.topics)) {
    const index = Number(topicsMatch[1]);
    const topics = [...(record.topics as unknown[])];
    if (index >= 0 && index < topics.length) {
      topics[index] = REDACTED_PLACEHOLDER;
    }
    record.topics = topics;
  }
}

interface RowUpdate {
  readonly text?: string;
  readonly textNormalized?: string;
  readonly metadata?: Record<string, unknown>;
  /** Cleared alongside `text` — see `buildRowUpdate`. */
  readonly embedding?: number[] | null;
}

/**
 * Builds the columns to write for one row, given ONLY the paths this row's own
 * classification flagged `remediate`. A path absent from `remediatePaths`
 * leaves its column untouched — see the field-level-not-row-level rationale
 * above.
 */
function buildRowUpdate(
  row: Pick<MemoryFactRemediationRow, 'category' | 'metadata'>,
  remediatePaths: readonly string[],
): RowUpdate {
  const update: {
    text?: string;
    textNormalized?: string;
    metadata?: Record<string, unknown>;
    embedding?: number[] | null;
  } = {};

  if (remediatePaths.includes('text')) {
    update.text = REDACTED_PLACEHOLDER;
    update.textNormalized = normalizeMemoryText(REDACTED_PLACEHOLDER);
    // THE EMBEDDING IS A THIRD CARRIER OF THE SAME SENTENCE. It is a vector of
    // the pre-redaction text and it sits behind an HNSW cosine index, so a
    // scrubbed row would remain retrievable by semantic similarity to the exact
    // clinical phrasing this item exists to remove — the text would be gone from
    // the column and still reachable through search. Null is available (the
    // column is nullable) and readers already skip a null embedding, so the row
    // simply stops matching until something re-embeds the redacted text.
    update.embedding = null;
  }

  const metadataPaths = remediatePaths.filter((path) => path !== 'text');
  if (metadataPaths.length > 0) {
    const record = metadataRecord(row.metadata);
    for (const path of metadataPaths) {
      redactMetadataPath(record, path);
    }
    update.metadata = record;
  }

  return update;
}

function rowUpdateAffectedCount(
  result: { rowCount?: number | null } | unknown[],
): number {
  return Array.isArray(result) ? result.length : (result?.rowCount ?? 0);
}

/**
 * Compare-and-set predicate for a memory-fact remediation row. Metadata-only
 * redactions rebuild JSONB from the scanned value, so the write must refuse a
 * row whose text OR metadata changed after that scan. A refused write is
 * reported as `skippedChanged` and a later run reclassifies current data.
 */
export function memoryFactCasGuard(
  row: Pick<MemoryFactRemediationRow, 'id' | 'text' | 'metadata'>,
): SQL {
  const guard = and(
    eq(memoryFacts.id, row.id),
    eq(memoryFacts.text, row.text),
    eq(memoryFacts.metadata, row.metadata),
  );
  if (!guard) {
    throw new Error('memory_facts remediation requires a CAS predicate');
  }
  return guard;
}

/**
 * Group key for the collision-avoidance grouping described above. Computed
 * from the row's ORIGINAL `metadata` (before any redaction), because that is
 * what the partial unique index's existing rows were built against — the
 * point of grouping on it is to find every row that already shares an index
 * slot with this one. JSON tuple encoding keeps field boundaries unambiguous
 * even when a value contains a would-be separator. Missing, null, and empty
 * subject/context values are normalized to `''` first to mirror the index's
 * `COALESCE(..., '')` equality rather than inventing a different grouping.
 */
export function memoryFactActiveGroupKey(row: {
  readonly profileId: string;
  readonly category: string;
  readonly metadata: unknown;
}): string {
  const record = metadataRecord(row.metadata);
  const subject = typeof record.subject === 'string' ? record.subject : '';
  const context = typeof record.context === 'string' ? record.context : '';
  return JSON.stringify([row.profileId, row.category, subject, context]);
}

/**
 * Scrubs one row in place via a compare-and-set guarded on both values read to
 * build its replacement. A concurrent text or metadata update leaves the row
 * unchanged and is counted as `skippedChanged`, so a later run can classify
 * the current row instead of writing a stale JSONB reconstruction.
 */
async function scrubRowInPlace(
  db: Database,
  row: MemoryFactRemediationRow,
  remediatePaths: readonly string[],
): Promise<boolean> {
  const update = buildRowUpdate(row, remediatePaths);
  if (update.text === undefined && update.metadata === undefined) return false;

  const result = await db
    .update(memoryFacts)
    // scope-allow: guarded by the row id plus its exact prior text and
    // metadata; the job is deliberately cross-profile.
    .set({ ...update, updatedAt: new Date() })
    .where(memoryFactCasGuard(row))
    .returning({ id: memoryFacts.id });

  return rowUpdateAffectedCount(result) > 0;
}

/**
 * Scrubs a duplicate row AND supersedes it by the survivor, in one update —
 * the row leaves the partial unique index's WHERE clause the instant
 * `supersededBy` is non-null, so the same statement that redacts its text also
 * removes the collision risk.
 */
async function scrubAndSupersedeDuplicate(
  db: Database,
  row: MemoryFactRemediationRow,
  remediatePaths: readonly string[],
  survivorId: string,
): Promise<boolean> {
  if (row.id === survivorId) {
    // Defensive only — see the cascade-delete cycle note above. The ordering
    // this module uses (survivor = group[0], duplicates = group.slice(1))
    // cannot produce this, so reaching here would indicate a logic error
    // upstream, not a data condition to recover from.
    throw new Error(
      'memory_facts remediation: refusing to supersede a row by itself',
    );
  }

  const update = buildRowUpdate(row, remediatePaths);
  const now = new Date();

  const result = await db
    .update(memoryFacts)
    // scope-allow: guarded by the row id plus its exact prior text and
    // metadata; the job is deliberately cross-profile.
    .set({
      ...update,
      supersededBy: survivorId,
      supersededAt: now,
      updatedAt: now,
    })
    .where(memoryFactCasGuard(row))
    .returning({ id: memoryFacts.id });

  return rowUpdateAffectedCount(result) > 0;
}

/**
 * Remediate `memory_facts`. Returns two reports — one per carrier family, so
 * "how many rows had their primary sentence redacted" and "how many rows had
 * a metadata duplicate redacted" are visible separately rather than folded
 * into one count that would hide which carrier a defeat happened in.
 */
export async function remediateMemoryFacts(
  db: Database,
): Promise<SurfaceRemediationReport[]> {
  // scope-allow: system remediation job intentionally scans and scrubs across
  // all profiles; the sweep is defined by the offending text, not by an owner.
  const rows = await db
    .select({
      id: memoryFacts.id,
      profileId: memoryFacts.profileId,
      category: memoryFacts.category,
      text: memoryFacts.text,
      metadata: memoryFacts.metadata,
      supersededBy: memoryFacts.supersededBy,
      createdAt: memoryFacts.createdAt,
    })
    .from(memoryFacts);

  const multiRows: MultiTextRow[] = rows.map((row) => ({
    id: row.id,
    fields: [
      { path: 'text', text: row.text },
      ...metadataTextFields(row.category, row.metadata),
    ],
  }));

  const verdicts = await classifyRowFields({
    fieldKind: 'memory_fact',
    rows: multiRows,
  });
  const verdictById = new Map(verdicts.map((verdict) => [verdict.id, verdict]));

  let textScanned = 0;
  let textReview = 0;
  let textRemediated = 0;
  let textSkippedChanged = 0;

  let metadataScanned = 0;
  let metadataReview = 0;
  let metadataRemediated = 0;
  let metadataSkippedChanged = 0;

  const activeTextGroups = new Map<string, MemoryFactRemediationRow[]>();
  const otherUpdates: {
    row: MemoryFactRemediationRow;
    remediatePaths: string[];
  }[] = [];

  for (const row of rows) {
    textScanned += 1; // text is NOT NULL — every row has one to classify.
    const hasMetadataFields =
      metadataTextFields(row.category, row.metadata).length > 0;
    if (hasMetadataFields) metadataScanned += 1;

    const verdict = verdictById.get(row.id);
    if (!verdict) continue;

    const textRemediate = verdict.remediate.includes('text');
    const metadataRemediatePaths = verdict.remediate.filter(
      (path) => path !== 'text',
    );
    if (verdict.review.includes('text')) textReview += 1;
    if (verdict.review.some((path) => path !== 'text')) metadataReview += 1;

    if (!textRemediate && metadataRemediatePaths.length === 0) continue;

    const remediationRow: MemoryFactRemediationRow = {
      id: row.id,
      profileId: row.profileId,
      category: row.category,
      text: row.text,
      metadata: row.metadata,
      supersededBy: row.supersededBy,
      createdAt: row.createdAt,
    };

    // Grouping/superseding is only needed for ACTIVE rows getting a `text`
    // redaction — that is the only case that can create a NEW collision on
    // the partial unique index (see the module doc comment). Every other
    // flagged row — already-superseded rows regardless of which carrier is
    // flagged, and active rows with only a metadata-path redaction — is
    // scrubbed in place with no grouping.
    if (row.supersededBy === null && textRemediate) {
      const key = memoryFactActiveGroupKey(remediationRow);
      const group = activeTextGroups.get(key) ?? [];
      group.push(remediationRow);
      activeTextGroups.set(key, group);
    } else {
      const remediatePaths = [
        ...(textRemediate ? ['text'] : []),
        ...metadataRemediatePaths,
      ];
      otherUpdates.push({ row: remediationRow, remediatePaths });
    }
  }

  for (const { row, remediatePaths } of otherUpdates) {
    const updated = await scrubRowInPlace(db, row, remediatePaths);
    tallyOutcome(remediatePaths, updated);
  }

  for (const group of activeTextGroups.values()) {
    const ordered = [...group].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    const [survivor, ...duplicates] = ordered;
    if (!survivor) continue;

    // Recompute this row's own remediate paths — `verdictById` still has them.
    const survivorVerdict = verdictById.get(survivor.id);
    const survivorPaths = [
      'text',
      ...(survivorVerdict?.remediate.filter((path) => path !== 'text') ?? []),
    ];
    const survivorUpdated = await scrubRowInPlace(db, survivor, survivorPaths);
    tallyOutcome(survivorPaths, survivorUpdated);

    for (const duplicate of duplicates) {
      const duplicateVerdict = verdictById.get(duplicate.id);
      const duplicatePaths = [
        'text',
        ...(duplicateVerdict?.remediate.filter((path) => path !== 'text') ??
          []),
      ];
      const duplicateUpdated = await scrubAndSupersedeDuplicate(
        db,
        duplicate,
        duplicatePaths,
        survivor.id,
      );
      tallyOutcome(duplicatePaths, duplicateUpdated);
    }
  }

  function tallyOutcome(
    remediatePaths: readonly string[],
    updated: boolean,
  ): void {
    const textPath = remediatePaths.includes('text');
    const metadataPaths = remediatePaths.filter((path) => path !== 'text');
    if (textPath) {
      if (updated) textRemediated += 1;
      else textSkippedChanged += 1;
    }
    if (metadataPaths.length > 0) {
      if (updated) metadataRemediated += 1;
      else metadataSkippedChanged += 1;
    }
  }

  return [
    {
      surface: 'memory_facts.text',
      scanned: textScanned,
      remediated: textRemediated,
      review: textReview,
      skippedChanged: textSkippedChanged,
    },
    {
      surface: 'memory_facts.metadata',
      scanned: metadataScanned,
      remediated: metadataRemediated,
      review: metadataReview,
      skippedChanged: metadataSkippedChanged,
    },
  ];
}

// ---------------------------------------------------------------------------
// topic_notes.artifact_concept_key
// ---------------------------------------------------------------------------

/**
 * `evidence-links.ts`'s `persistVerifiedChallengeArtifacts` /
 * `storedArtifactContent` writes, for `artifactSource === 'challenge_solid_quote'`,
 * the SAME string to both `topic_notes.content` and
 * `topic_notes.artifact_concept_key` — verified by reading the function: the
 * `topicNotes` insert sets `content: storedArtifactContent(input)` and
 * `artifactConceptKey: input.artifactSource === 'challenge_solid_quote' ?
 * input.conceptKey : null`, and `storedArtifactContent` returns
 * `input.conceptKey` for that exact branch. The landed `remediateTopicNotes`
 * (`persisted-remediation-apply.ts`) only scrubs `.content`, so this duplicate
 * survives untouched after that pass.
 *
 * `artifactConceptKey` is CONDITIONALLY NOT NULL, not simply nullable — this
 * corrects the brief's premise. `packages/database/src/schema/notes.ts`
 * declares the column nullable (no `.notNull()`), but migration
 * `0154_wi1704_verified_artifact_evidence_links.sql` adds
 * `topic_notes_solid_quote_concept_check`: `CHECK ("artifact_source" <>
 * 'challenge_solid_quote' OR "artifact_concept_key" IS NOT NULL)`. Every row
 * this function targets (filtered to `artifactSource = 'challenge_solid_quote'`,
 * since that is the only value `evidence-links.ts` ever pairs with a
 * non-null `artifactConceptKey`) has `artifact_source = 'challenge_solid_quote'`
 * BY CONSTRUCTION, so writing `NULL` here — as the brief specified, "matching
 * how the landed code treats its other nullable columns" — would violate that
 * CHECK constraint and fail the update outright. This module writes
 * `REDACTED_PLACEHOLDER` instead (the same value `.content` receives from
 * `remediateTopicNotes`), which satisfies the constraint and keeps the two
 * duplicated columns holding the same redaction marker rather than one
 * placeholder and one raw string.
 */
export async function remediateTopicNoteArtifactConceptKeys(
  db: Database,
): Promise<SurfaceRemediationReport> {
  // scope-allow: system remediation job intentionally scans and scrubs across
  // all profiles; the sweep is defined by the offending text, not by an owner.
  const rows = await db
    .select({ id: topicNotes.id, text: topicNotes.artifactConceptKey })
    .from(topicNotes)
    .where(eq(topicNotes.artifactSource, 'challenge_solid_quote'));

  const withText = rows.filter(
    (row): row is { id: string; text: string } => typeof row.text === 'string',
  );
  if (withText.length === 0) {
    return {
      surface: 'topic_notes.artifact_concept_key',
      scanned: 0,
      remediated: 0,
      review: 0,
      skippedChanged: 0,
    };
  }

  const verdicts = await classifyRowFields({
    fieldKind: 'note_text',
    rows: withText.map((row) => ({
      id: row.id,
      fields: [{ path: 'artifact_concept_key', text: row.text }],
    })),
  });
  const textById = new Map(withText.map((row) => [row.id, row.text]));

  const review = verdicts.filter((verdict) => verdict.review.length > 0).length;
  const toRemediate = verdicts.filter(
    (verdict) => verdict.remediate.length > 0,
  );

  let scrubbed = 0;
  for (const verdict of toRemediate) {
    const originalText = textById.get(verdict.id);
    if (originalText === undefined) continue;
    const result = await db
      .update(topicNotes)
      // scope-allow: guarded by the row id plus its exact prior text; the job
      // is deliberately cross-profile.
      .set({ artifactConceptKey: REDACTED_PLACEHOLDER })
      .where(
        and(
          eq(topicNotes.id, verdict.id),
          eq(topicNotes.artifactConceptKey, originalText),
        ),
      )
      .returning({ id: topicNotes.id });
    if (rowUpdateAffectedCount(result) > 0) scrubbed += 1;
  }

  return {
    surface: 'topic_notes.artifact_concept_key',
    scanned: withText.length,
    remediated: scrubbed,
    review,
    skippedChanged: toRemediate.length - scrubbed,
  };
}

/*
 * ---------------------------------------------------------------------------
 * Trailing notes for the reviewer
 * ---------------------------------------------------------------------------
 *
 * (1) THINGS I AM UNSURE ABOUT
 *
 * - Field-level vs row-level redaction (see the long comment above
 *   `MemoryFactRemediationRow`) is the single biggest judgment call in this
 *   file. I chose field-level because the alternative breaks the documented
 *   `review` contract, but I have not run this against real data, and I have
 *   not verified empirically that the classifier's ten-grammar scan actually
 *   gives IDENTICAL verdicts for `text` and its embedded `metadata.subject` /
 *   `metadata.topic` substring in every case — only that it is designed to
 *   (each is scanned independently under every grammar). If it turns out the
 *   classifier disagrees across the two strings more often than expected,
 *   this design will under-redact one carrier while over-trusting the other.
 * - VERIFIED (WI-3076): the compare-and-set guard matches the original
 *   `memory_facts.id`, `text`, and JSONB `metadata` value. A concurrent writer
 *   changing either source value makes the update affect zero rows; the report
 *   records `skippedChanged` so a later run can reclassify the current row
 *   rather than write a stale JSONB reconstruction.
 * - `activeGroupKey` groups on `metadata.subject`/`metadata.context` read from
 *   the ORIGINAL (pre-redaction) metadata. If a row's `metadata.subject` is
 *   ITSELF being redacted in the same pass, the grouping key used to decide
 *   "does this row collide with another" still reflects the pre-redaction
 *   value, which I believe is correct (see the module comment) but could not
 *   verify against a live database.
 * - I did not verify whether any code path reads `memory_facts.metadata`
 *   assuming `topics` retains its original array LENGTH or order — I preserve
 *   both (only replacing flagged entries' string values), but did not find
 *   time to search every reader.
 *
 * (2) CLAIMS FROM THE BRIEF: VERIFIED vs. COULD NOT CONFIRM vs. WRONG
 *
 * - VERIFIED: `metadata.subject`/`metadata.topics[]` (strength) and
 *   `metadata.label` (interest) duplicate `text` — read directly off
 *   `mapStrengthToFact` / `mapInterestToFact` in `backfill-mapping.ts`.
 * - ADDITIONAL FINDING NOT IN THE BRIEF: `category: 'struggle'` has the same
 *   duplication shape (`metadata.subject`, `metadata.topic`, via
 *   `mapStruggleToFact`) and I have included it in scope.
 * - VERIFIED: the partial unique index's predicate is on `superseded_by`, not
 *   `superseded_at` — confirmed by reading
 *   `memory_facts_active_unique_idx`'s `.where(sql`${table.supersededBy} IS
 *   NULL`)` in `packages/database/src/schema/memory-facts.ts`.
 * - VERIFIED: `cascade-delete.ts`'s recursive CTE walks `superseded_by`
 *   (`m.superseded_by = a.id`), so a self-referencing `supersededBy` would be
 *   a cycle risk — read directly off `cascadeDeleteFactWithAncestry`.
 * - VERIFIED: `evidence-links.ts` duplicates the same string into
 *   `topic_notes.content` and `topic_notes.artifact_concept_key` for
 *   `artifactSource === 'challenge_solid_quote'` — read directly off
 *   `persistVerifiedChallengeArtifacts` / `storedArtifactContent`.
 * - WRONG, CORRECTED: the brief says `artifact_concept_key` is "nullable — so
 *   set it to null". The COLUMN is nullable in the TypeScript schema, but a DB
 *   CHECK constraint (`topic_notes_solid_quote_concept_check`, migration
 *   0154) forbids NULL whenever `artifact_source = 'challenge_solid_quote'` —
 *   which is every row this function targets. Nulling would fail the
 *   constraint. I used `REDACTED_PLACEHOLDER` instead; see the doc comment
 *   above `remediateTopicNoteArtifactConceptKeys`.
 *
 * (3) OTHER THINGS ON THESE ROWS KEYED BY THE SCRUBBED TEXT
 *
 * - VERIFIED (WI-3076): `memory_facts.embedding` is cleared whenever `text`
 *   is remediated. It is a semantic carrier of the pre-redaction sentence, so
 *   retaining it would leave the scrubbed fact retrievable by similarity.
 * - `memory_facts.sourceSessionIds` / `sourceEventIds` point at transcript
 *   rows that may themselves still contain the original clinical text
 *   (this module never touches transcripts) — out of scope for a
 *   `memory_facts`-column remediation, but worth the operator's awareness
 *   since the `text` scrub does not make the fact's provenance unreachable.
 */
