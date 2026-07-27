// ---------------------------------------------------------------------------
// [WI-2628] Stage 3 — the async batch evaluator (AC-1) and the ONE public entry
// point every persisted-learning-text boundary calls (AC-5).
//
// Stage 1 landed the deterministic scan, Stage 2 the independent judge. Neither
// was callable as the AC-1 contract: the scan is synchronous and single-field,
// and `judgeReferredLearningText` consumes one already-computed scan. This
// module is the composition — fields in, decisions out, one call.
//
// WHAT CALLERS GET, AND WHY IT IS SHAPED THIS WAY.
//
//   `isSafe(key)` FAILS CLOSED ON AN UNKNOWN KEY. This is the load-bearing
//   property, not defensive padding. Callers that must evaluate before opening a
//   transaction (an LLM round-trip inside an open transaction pins a pooled
//   connection for its duration) look the decision up again inside it, against
//   state that may have moved. A key that was never evaluated is therefore
//   indistinguishable from a key whose text changed under the caller — both are
//   "this string was not cleared", and both must block. Returning `true` for an
//   unenumerated key would make the most likely wiring mistake (forgetting a
//   field) look exactly like success.
//
//   DECISIONS ARE BOOLEAN + REASON CODE, never text. AC-6: observability records
//   field kind, reason and count only. Nothing in this module logs, returns or
//   stores the scanned text, and nothing logs a provider or judge string —
//   `judge.ts` records an error's CLASS NAME rather than `error.message` for
//   exactly this reason, and that discipline continues here.
//
// THE ASYMMETRY IS THE CALLER'S, NOT OURS (AC-5). A derived write DROPS unsafe
// data; a user mutation raises `BadRequestError`. Both consume the same decision
// — `assertLearningTextSafe` is the throwing wrapper for the user-mutation side.
// Keeping the decision itself verdict-only is what lets one gate serve both.
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import {
  conversationLanguageSchema,
  type ConversationLanguage,
} from '@eduagent/schemas';
import { BadRequestError } from '../../errors';
import { createLogger } from '../logger';
import { judgeReferredLearningText } from './judge';
import {
  scanLearningText,
  type LearningTextBlockReason,
  type LearningTextFieldKind,
  type LearningTextProvenance,
  type ScanLearningTextResult,
} from './scan';

const logger = createLogger();

/**
 * All ten declared languages, from the schema rather than a local literal, so a
 * newly supported locale is covered here the moment it is added to the enum.
 */
const ALL_CONVERSATION_LANGUAGES: readonly ConversationLanguage[] =
  conversationLanguageSchema.options;

/** Observability flow label — mirrors the judge's per-flow dashboard tag. */
const GATE_FLOW = 'gate.learning_text_safety';

/**
 * One field heading for persistence.
 *
 * `text` accepts null/undefined and treats it as trivially safe: there is no
 * string to persist, so there is nothing to characterize a learner with. This
 * matches the shipped guard's `scrubClinicalInferenceFromLearningRecord(null) ===
 * null` contract at every call site that passes a nullable column, and it keeps
 * the key ENUMERATED — dropping nullable fields from the batch instead would
 * make `isSafe` fail closed on them and silently discard legitimate nulls.
 */
export interface LearningTextField {
  /**
   * The caller's own handle for this field. Only ever compared, never parsed,
   * never logged (a caller could build it from learner text). Duplicates are
   * allowed and resolve to the same decision.
   */
  readonly key: string;
  readonly fieldKind: LearningTextFieldKind;
  readonly text: string | null | undefined;
}

export interface EvaluateLearningTextFieldsInput {
  readonly fields: readonly LearningTextField[];
  /**
   * The learner's declared conversation language, or `undefined` when it cannot
   * be resolved — `parseConversationLanguage` collapses a null column and any
   * unrecognised code to `undefined`, and callers pass that straight through.
   *
   * NEVER substitute `'en'` for an unresolved value. The declared language
   * selects which attribution GRAMMAR is co-compiled (declared + English), so
   * defaulting to English is precisely the English-only behaviour this Work Item
   * exists to remove: `Petr má dyslexii.` would classify ambiguous instead of
   * block. `undefined` is handled by scanning under every language and keeping
   * the strictest verdict — see `scanField`.
   */
  readonly conversationLanguage: ConversationLanguage | undefined;
  readonly provenance: LearningTextProvenance;
  /**
   * The vendor that produced LLM-authored text. Required for a field to be
   * eligible for the judge at all — a missing producer fails closed to
   * `block`/`unclear` inside `scanLearningText` (AC-4). Ignored for
   * user/migration provenance.
   */
  readonly producerVendor?: string | null;
  readonly sessionId?: string;
}

export interface LearningTextFieldDecision {
  readonly key: string;
  readonly fieldKind: LearningTextFieldKind;
  /** True only when the text may be persisted. */
  readonly safe: boolean;
  /** Set iff `safe === false`. */
  readonly reason: LearningTextBlockReason | null;
}

export interface LearningTextGateResult {
  readonly decisions: readonly LearningTextFieldDecision[];
  readonly blockedCount: number;
  /**
   * Whether the field registered under `key` may be persisted. Returns FALSE
   * for a key this batch never evaluated — see the module header.
   */
  isSafe(key: string): boolean;
  /** The block reason for `key`, or null when safe or unknown. */
  reasonFor(key: string): LearningTextBlockReason | null;
}

/**
 * Evaluate a batch of fields: deterministic scan for all of them, then the
 * independent judge for exactly those the scan referred.
 *
 * Referral work is deduplicated by (fieldKind, text). Two fields carrying the
 * same string under the same field kind produce the same judge prompt and must
 * produce the same verdict, so sending both would spend twice the budget to
 * risk two different answers to one question.
 */
function scanField(
  field: LearningTextField,
  input: EvaluateLearningTextFieldsInput,
): ScanLearningTextResult | null {
  // A null/undefined field is not scanned at all — there is no text.
  if (typeof field.text !== 'string') return null;

  const base = {
    text: field.text,
    provenance: input.provenance,
    fieldKind: field.fieldKind,
    producerVendor: input.producerVendor,
  };

  if (input.conversationLanguage !== undefined) {
    return scanLearningText({
      ...base,
      conversationLanguage: input.conversationLanguage,
    });
  }

  // UNRESOLVED DECLARED LANGUAGE — scan under every language and keep the
  // strictest verdict. This is the fail-closed reading, and it is cheap: lexeme
  // detection already spans all ten corpora regardless of declared language, so
  // the only thing varying across iterations is which attribution grammar is
  // compiled, and `grammarFor` memoizes each one. Ten pure synchronous passes,
  // no I/O. Strictly more conservative than any single language could be, which
  // is why it needs no policy decision about WHICH language to assume.
  let referred: ScanLearningTextResult | null = null;
  let cleared: ScanLearningTextResult | null = null;
  for (const language of ALL_CONVERSATION_LANGUAGES) {
    const result = scanLearningText({
      ...base,
      conversationLanguage: language,
    });
    // `block` is the strictest outcome available, so no later language can
    // change the answer — return immediately.
    if (result.disposition === 'block') return result;
    if (result.disposition === 'refer') referred ??= result;
    else cleared ??= result;
  }
  // `refer` outranks `clear`: if ANY language finds a protected lexeme worth
  // referring, the judge decides rather than a clear from another grammar
  // silently winning.
  return referred ?? cleared;
}

export async function evaluateLearningTextFields(
  input: EvaluateLearningTextFieldsInput,
): Promise<LearningTextGateResult> {
  const scans = input.fields.map((field) => ({
    field,
    scan: scanField(field, input),
  }));

  // One judge call per distinct (fieldKind, text) that the scan referred.
  // Unit-separator delimited (the codebase's existing identity-key convention,
  // cf. `memory/backfill-mapping.ts`), so a field kind cannot run into the text
  // and let two different (kind, text) pairs share one cache entry.
  const referralKey = (
    fieldKind: LearningTextFieldKind,
    text: string,
  ): string => `${fieldKind}\u001f${text}`;
  const referred = new Map<
    string,
    { readonly scan: NonNullable<(typeof scans)[number]['scan']> }
  >();
  for (const { field, scan } of scans) {
    if (scan === null || scan.disposition !== 'refer') continue;
    // `field.text` is a string whenever a scan exists.
    referred.set(referralKey(field.fieldKind, field.text as string), { scan });
  }

  const judged = new Map<string, LearningTextBlockReason | null>();
  await Promise.all(
    [...referred].map(async ([key, { scan }]) => {
      const decision = await judgeReferredLearningText({
        scan,
        conversationLanguage: input.conversationLanguage,
        sessionId: input.sessionId,
      });
      judged.set(
        key,
        decision.disposition === 'clear' ? null : decision.reason,
      );
    }),
  );

  const decisions: LearningTextFieldDecision[] = scans.map(
    ({ field, scan }) => {
      if (scan === null) {
        return {
          key: field.key,
          fieldKind: field.fieldKind,
          safe: true,
          reason: null,
        };
      }
      if (scan.disposition === 'clear') {
        return {
          key: field.key,
          fieldKind: field.fieldKind,
          safe: true,
          reason: null,
        };
      }
      if (scan.disposition === 'block') {
        return {
          key: field.key,
          fieldKind: field.fieldKind,
          safe: false,
          // A `block` disposition always carries a reason (Stage 1's contract);
          // `unclear` is the fail-closed default if that ever drifts.
          reason: scan.reason ?? 'unclear',
        };
      }
      // Referred. A missing entry means the judge round never resolved for this
      // key, which is not a reason to persist it.
      const key = referralKey(field.fieldKind, field.text as string);
      const judgedReason = judged.get(key);
      // Safe requires BOTH that the judge resolved for this key and that it
      // returned the one allowance. An absent entry is a judge round that never
      // completed, which is not evidence of anything.
      const safe = judged.has(key) && judgedReason === null;
      return {
        key: field.key,
        fieldKind: field.fieldKind,
        safe,
        reason: safe ? null : (judgedReason ?? 'unclear'),
      };
    },
  );

  const byKey = new Map<string, LearningTextFieldDecision>();
  for (const decision of decisions) {
    // A duplicate key resolves to the STRICTER decision, so a caller that
    // reuses one key for two strings cannot launder the unsafe one.
    const existing = byKey.get(decision.key);
    if (existing === undefined || (existing.safe && !decision.safe)) {
      byKey.set(decision.key, decision);
    }
  }

  const blocked = decisions.filter((decision) => !decision.safe);
  if (blocked.length > 0) {
    // AC-6: field kind, reason and count. No text, no key, no provider string.
    logger.warn('[learning-text-safety] blocked fields before persistence', {
      flow: GATE_FLOW,
      blockedCount: blocked.length,
      fieldCount: decisions.length,
      blocked: blocked.map((decision) => ({
        fieldKind: decision.fieldKind,
        reason: decision.reason,
      })),
    });
  }

  return {
    decisions,
    blockedCount: blocked.length,
    isSafe: (key) => byKey.get(key)?.safe === true,
    reasonFor: (key) => byKey.get(key)?.reason ?? null,
  };
}

/**
 * The user-mutation half of AC-5's asymmetry: raise instead of dropping.
 *
 * Message is byte-identical to the shipped guard's
 * `assertNoClinicalInferenceInLearningRecord`, so the client-visible contract
 * does not change as call sites move onto the multilingual gate. In particular
 * it does NOT name the reason code, the language, or any part of the text —
 * telling a caller *why* their text was refused is the external disclosure AC-4
 * forbids.
 */
export function assertLearningTextSafe(
  result: LearningTextGateResult,
  key: string,
): void {
  if (!result.isSafe(key)) {
    throw new BadRequestError(
      'Learning records cannot store a health or disability characterisation',
    );
  }
}

/**
 * Convenience for the single-field callers (the majority). Same contract as
 * `evaluateLearningTextFields`; returns whether that one field may persist.
 */
export async function isLearningTextSafe(
  input: Omit<EvaluateLearningTextFieldsInput, 'fields'> & {
    readonly fieldKind: LearningTextFieldKind;
    readonly text: string | null | undefined;
  },
): Promise<boolean> {
  const result = await evaluateLearningTextFields({
    ...input,
    fields: [{ key: 'field', fieldKind: input.fieldKind, text: input.text }],
  });
  return result.isSafe('field');
}

// ---------------------------------------------------------------------------
// CONTENT-ADDRESSED KEYS — for callers that must evaluate BEFORE a transaction
// and re-verify INSIDE it.
//
// Three of the persisted-learning-text boundaries gate text that is only
// derived from a read taken inside their transaction (`learner-profile.ts`'s
// merged analysis projection, and the two memory paths reached from it). They
// cannot evaluate inside — the gate can make an LLM round-trip, and holding a
// pooled connection across one is a connection-exhaustion hazard.
//
// The resolution is to key the decision on the TEXT rather than on a
// caller-chosen label: pre-evaluate the candidate set before the transaction,
// then inside it re-derive the merged text, recompute its key, and look the
// decision up. `isSafe` already fails closed on a key it never evaluated, so
// "this exact string was cleared" and "something moved under me" collapse into
// the same safe fact FOR FREE — no new failure mode, and no way for a caller to
// accidentally look up a decision belonging to a different string.
//
// That is the property this module's header claims and, before content keys,
// only half-delivered: a label-keyed decision stays "safe" even when the text
// behind the label changes.
// ---------------------------------------------------------------------------

/**
 * Content-addressed key for one candidate string.
 *
 * sha256 of the exact bytes — NOT the normalized form. Normalization is
 * match-only and never escapes `scan.ts`, and two strings that normalize alike
 * are still different strings to persist, so keying on the normalized form would
 * let one clear the other.
 *
 * Synchronous by design: it is recomputed INSIDE a transaction, where an async
 * hop is avoidable noise. `nodejs_compat` is enabled for this worker and
 * `createHash` is already used on production paths
 * (`inngest/functions/account-security-notification.ts`).
 *
 * The digest is not a secret and carries no learner text — it is safe to log,
 * which is why it can also serve as an observability correlator without
 * violating AC-6.
 */
export function learningTextContentKey(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Pre-evaluate a SET of candidate strings, each keyed by its own content.
 *
 * Duplicates collapse to one field (and therefore at most one judge call),
 * which is the common case for a merged projection where the same interest or
 * note appears in both the existing row and the incoming analysis.
 * Null/undefined entries are skipped — they are looked up through
 * `isContentSafe`, which treats them as trivially safe because there is no
 * string to persist.
 */
export async function evaluateLearningTextByContent(
  input: Omit<EvaluateLearningTextFieldsInput, 'fields'> & {
    readonly fieldKind: LearningTextFieldKind;
    readonly texts: readonly (string | null | undefined)[];
  },
): Promise<LearningTextGateResult> {
  const seen = new Set<string>();
  const fields: LearningTextField[] = [];
  for (const text of input.texts) {
    if (typeof text !== 'string') continue;
    const key = learningTextContentKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, fieldKind: input.fieldKind, text });
  }
  return evaluateLearningTextFields({ ...input, fields });
}

/**
 * Whether THIS EXACT string was cleared by the batch.
 *
 * Returns false for any string the batch did not evaluate — including one whose
 * content changed after the pre-evaluation. Callers inside a transaction treat
 * that as their retry / skip signal rather than as a block, since it means the
 * state moved, not that the text is unsafe. Null/undefined is trivially safe:
 * there is no string to persist.
 *
 * CALLER CONTRACT — check exactly the bytes you will persist. Pass the same
 * expression the write uses, not an earlier or unnormalized version of it. A site
 * that checks `payload.field` and writes `normalize(payload.field)` fails OPEN: the
 * check clears one string while a different, unevaluated string is persisted. That
 * mismatch is the one way to defeat this module, and it is invisible to the type
 * system — nothing here can detect it, so it is a review obligation at every site.
 */
export function isContentSafe(
  result: LearningTextGateResult,
  text: string | null | undefined,
): boolean {
  if (typeof text !== 'string') return true;
  return result.isSafe(learningTextContentKey(text));
}
