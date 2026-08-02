import { conversationLanguageSchema } from '@eduagent/schemas';
import { evaluateLearningTextByContent, learningTextContentKey } from './gate';
import type { LearningTextBlockReason, LearningTextFieldKind } from './scan';

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

/**
 * Every conversation language, read from the shared enum so a newly supported
 * locale is covered the moment it is added rather than needing a second list
 * here (the same sourcing the gate itself uses).
 */
const ALL_CONVERSATION_LANGUAGES = conversationLanguageSchema.options;

export interface PersistedTextRow {
  /** Caller's row identity. Opaque here; never logged with the text. */
  readonly id: string;
  readonly text: string | null | undefined;
}

export interface PersistedTextVerdict {
  readonly id: string;
  readonly disposition: PersistedTextDisposition;
  readonly reason: LearningTextBlockReason | null;
}

/**
 * Classify a batch of persisted rows of ONE field kind, scanning under EVERY
 * attribution grammar and keeping the strictest REASON any of them produces.
 *
 * WHY NOT THE LEARNER'S DECLARED LANGUAGE. The obvious source — joining
 * `person.conversation_language` — is the learner's CURRENT, MUTABLE preference,
 * not provenance stored alongside the row. A learner who wrote Spanish notes and
 * later switched to English would have their clinical rows scanned under the
 * wrong grammar. Measured, not assumed: at an unresolved or mismatched language
 * a German, Czech or French attribution classifies `unclear` rather than
 * `person_attribution`, so it would drop into the review queue instead of being
 * remediated — an automatic sweep that quietly stops sweeping.
 *
 * WHY SCANNING EVERY GRAMMAR IS SAFE. The gate's own unresolved-language path
 * already scans all ten and keeps the strictest DISPOSITION; this applies the
 * same idea one level down, to the reason. Each non-English attribution is
 * caught by its own grammar, and — measured across the corpus — neither
 * educational reference nor benign learning text yields an attribution reason
 * under ANY grammar. So the broader scan finds more true positives without
 * manufacturing false ones, which matters because a false positive here destroys
 * learner text.
 */
export async function classifyPersistedLearningText(input: {
  readonly fieldKind: LearningTextFieldKind;
  readonly rows: readonly PersistedTextRow[];
}): Promise<PersistedTextVerdict[]> {
  const withText = input.rows.filter(
    (row): row is PersistedTextRow & { text: string } =>
      typeof row.text === 'string',
  );

  // Strictest reason seen for each row across all grammars. An attribution from
  // any one language outranks an `unclear` from the other nine.
  const strongest = new Map<string, LearningTextBlockReason | null>();

  if (withText.length > 0) {
    const texts = withText.map((row) => row.text);
    const perLanguage = await Promise.all(
      ALL_CONVERSATION_LANGUAGES.map((language) =>
        evaluateLearningTextByContent({
          fieldKind: input.fieldKind,
          texts,
          conversationLanguage: language,
          // [AC-4] Migration provenance. `resolveReferralPayload` returns null
          // for it, so no row can reach the judge: the classification is a pure
          // function of the bytes and the grammars, with no LLM call, no per-row
          // cost, and no way for two runs to disagree about the same text.
          provenance: 'migration',
        }),
      ),
    );

    for (const row of withText) {
      const key = learningTextContentKey(row.text);
      let best: LearningTextBlockReason | null = null;
      for (const result of perLanguage) {
        const reason = result.reasonFor(key);
        if (reason === null) continue;
        if (REMEDIABLE_REASONS.includes(reason)) {
          best = reason;
          break;
        }
        best ??= reason;
      }
      strongest.set(row.id, best);
    }
  }

  return input.rows.map((row) => {
    // A row with no text was never scanned and has nothing to remediate.
    if (typeof row.text !== 'string') {
      return { id: row.id, disposition: 'clear' as const, reason: null };
    }
    const reason = strongest.get(row.id) ?? null;
    return {
      id: row.id,
      reason,
      disposition:
        reason === null
          ? ('clear' as const)
          : REMEDIABLE_REASONS.includes(reason)
            ? ('remediate' as const)
            : ('review' as const),
    };
  });
}
