import { evaluateLearningTextByContent, learningTextContentKey } from './gate';
import type { LearningTextBlockReason, LearningTextFieldKind } from './scan';
import type { ConversationLanguage } from '@eduagent/schemas';

/**
 * [WI-2753] Classify ALREADY-PERSISTED learning text for remediation.
 *
 * The English-only gate let non-English clinical text reach the database. This
 * decides, per row, which of three things to do with it — and the whole design
 * turns on the fact that those are THREE outcomes, not two.
 *
 * WHY NOT "REMEDIATE EVERYTHING THE GATE BLOCKS". At `provenance: 'migration'`
 * the gate fails closed on ambiguity: educational prose ("This chapter explains
 * what dyslexia is.") blocks with reason `unclear`, exactly as a genuine
 * attribution does. Scrubbing on "blocked" would therefore destroy the learner
 * capability the 2026-07-26 ruling deliberately restored, and would make AC-5's
 * "a legitimate educational-reference row is not remediated" unsatisfiable.
 *
 * So the discriminator is the REASON, not the disposition:
 *
 *   person_attribution | diagnostic_inference → REMEDIATE. Both come from the
 *     same branch of the scan — a found attribution span — and differ only in
 *     whether an inference marker sits inside that span. Treating only the
 *     unhedged label as actionable would silently leave every hedged
 *     attribution ("El alumno probablemente tiene TEA") in place, which is the
 *     precise text this item exists to remove.
 *   unclear → REVIEW. Report it, never destroy it. For a destructive backfill
 *     with no human in the loop, ambiguity must not be resolved by deletion.
 *   safe → CLEAR.
 */
export type PersistedTextDisposition = 'remediate' | 'review' | 'clear';

/**
 * The reasons that authorise destroying persisted text. Derived from a
 * deterministic attribution match, so the verdict for the same bytes is stable
 * across runs — which is what makes the remediation idempotent (AC-4) rather
 * than merely re-runnable.
 */
const REMEDIABLE_REASONS: readonly LearningTextBlockReason[] = [
  'person_attribution',
  'diagnostic_inference',
];

export interface PersistedTextRow {
  /** Caller's row identity. Opaque here; never logged with the text. */
  readonly id: string;
  readonly text: string | null | undefined;
  /**
   * The row's OWN declared conversation language, or undefined when the column
   * is null or holds an unrecognised code.
   *
   * Load-bearing, and measured rather than assumed: with the declared language
   * absent, `Der Schüler hat ADHS.` classifies `unclear` instead of
   * `person_attribution` and would be missed by the rule above while being
   * indistinguishable from an educational row. Never substitute `'en'` — the
   * gate documents that as the English-only behaviour WI-2628 removed. An
   * unresolved value is passed through as `undefined`, which makes the gate scan
   * every grammar and keep the strictest verdict.
   */
  readonly conversationLanguage: ConversationLanguage | undefined;
}

export interface PersistedTextVerdict {
  readonly id: string;
  readonly disposition: PersistedTextDisposition;
  readonly reason: LearningTextBlockReason | null;
}

/**
 * Classify a batch of persisted rows of ONE field kind.
 *
 * Rows are grouped by declared language because the gate takes a single
 * `conversationLanguage` per call, not one per field — so "pass each row's own
 * language" is expressed as one call per language group. Grouping also keeps
 * the deduplication inside `evaluateLearningTextByContent` effective: identical
 * text under the same language collapses to one evaluation.
 */
export async function classifyPersistedLearningText(input: {
  readonly fieldKind: LearningTextFieldKind;
  readonly rows: readonly PersistedTextRow[];
}): Promise<PersistedTextVerdict[]> {
  const byLanguage = new Map<string, PersistedTextRow[]>();
  for (const row of input.rows) {
    // A row with no text has nothing to remediate; `clear` it without a gate
    // call rather than letting `undefined` collapse into a language bucket.
    if (typeof row.text !== 'string') continue;
    const bucket = row.conversationLanguage ?? 'unresolved';
    const existing = byLanguage.get(bucket);
    if (existing) existing.push(row);
    else byLanguage.set(bucket, [row]);
  }

  // A row that was never bucketed (no text) falls through to the `clear`
  // default in the return below, so it needs no entry here.
  const verdicts = new Map<string, PersistedTextVerdict>();

  await Promise.all(
    [...byLanguage].map(async ([bucket, rows]) => {
      const result = await evaluateLearningTextByContent({
        fieldKind: input.fieldKind,
        texts: rows.map((row) => row.text as string),
        conversationLanguage:
          bucket === 'unresolved'
            ? undefined
            : (bucket as ConversationLanguage),
        // [AC-4] Migration provenance. `resolveReferralPayload` returns null for
        // it, so no row can reach the judge: the classification is a pure
        // function of the bytes and the grammar, with no LLM call, no per-row
        // cost, and no way for two runs to disagree about the same text.
        provenance: 'migration',
      });
      for (const row of rows) {
        const key = learningTextContentKey(row.text as string);
        const reason = result.reasonFor(key);
        verdicts.set(row.id, {
          id: row.id,
          reason,
          disposition:
            reason !== null && REMEDIABLE_REASONS.includes(reason)
              ? 'remediate'
              : reason !== null
                ? 'review'
                : 'clear',
        });
      }
    }),
  );

  return input.rows.map(
    (row) =>
      verdicts.get(row.id) ?? {
        id: row.id,
        disposition: 'clear' as const,
        reason: null,
      },
  );
}
