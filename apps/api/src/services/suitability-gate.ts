// ---------------------------------------------------------------------------
// Suitability-judge ENFORCING output gate for minors [WI-1365]
//
// Promotes the suitability judge (MMT-ADR-0016 §2, judge-suitability.ts) from
// async/calibration-only/fail-OPEN to a synchronous, fail-CLOSED-on-verdict
// enforcing OUTPUT gate for under-18 traffic. It backstops the router
// content-category refusals (harassment / hate / adult-sexual / civic —
// router.ts) that have no deterministic backstop today (MMT-ADR-0016 §3
// phase-5, Gap B). This is the WI-1350 Option A recommendation.
//
// SHAPE: mirrors applyDangerousProcedureGate — a pure decision (`applySuitabilityGate`)
// plus a thin async orchestrator (`runSuitabilityEnforcement`) that calls the
// judge and feeds its verdict into the decision. The pure decision is trivially
// unit-testable with no LLM.
//
// OVER-BLOCK CONTROLS (MMT-ADR-0016 §1 — over-blocking is a hard failure equal
// to under-blocking; the enforcing judge must not become the over-blocker its
// own `over_blocking` flag detects):
//   - Block ONLY when overall === 'violation'. A 'concern' NEVER blocks
//     (observe/telemetry only).
//   - Category allowlist: NEVER block on `over_blocking` / `topic_drift`. A
//     'violation' whose flags are exclusively allowlisted categories passes.
//   - Minor-only, fail-closed on unknown age (the caller scopes `isMinor`).
//
// AVAILABILITY (MMT-ADR-0016 §3 phase-5 amendment — fail-OPEN-with-alarm):
// a judge that cannot render a verdict (route error, no JSON, invalid schema →
// `runSuitabilityJudge` returns null) FAILS OPEN — the reply passes unchanged —
// AND raises a structured operator alarm at the call site (can't-judge is not
// unsafe; silent recovery is banned on safety paths, so the caller emits a
// queryable event, never a bare console.warn). Fail-CLOSED is reserved for a
// concrete verdict === 'violation'.
//
// FLAG: the whole mechanism is inert unless `JUDGE_ENFORCEMENT_ENABLED` is on.
// It lands OFF by default. No live enforcement threshold is set pre-launch —
// the calibration-gated threshold must be harvested from real minor-traffic
// judge.verdict data before any flip (MMT-ADR-0016 §3 phase-5).
// ---------------------------------------------------------------------------

import {
  JUDGE_FLAG_CATEGORIES,
  type AgeBracket,
  type ConversationLanguage,
  type JudgeFlagCategory,
  type JudgeVerdict,
} from '@eduagent/schemas';
import { runSuitabilityJudge } from './policy-engine/judge-suitability';

/** Marker recorded in the persisted model field when the enforcing gate fires. */
export const SUITABILITY_GATE_MODEL = 'judge:suitability_enforcement';

/**
 * Categories that must NEVER, on their own, cause a block. Blocking an
 * `over_blocking` verdict would suppress a legitimate reply the judge flagged as
 * wrongly-refused — doubly wrong (MMT-ADR-0016 §1). `topic_drift` is a quality
 * signal, not a safety violation. Both stay observe-only even at 'violation'.
 */
export const SUITABILITY_GATE_ALLOWLIST: readonly JudgeFlagCategory[] = [
  'over_blocking',
  'topic_drift',
];

// Compile-time reminder: the allowlist references live members of the flag
// enum. If a category is renamed/removed, this dead-code check surfaces it.
const _allowlistIsSubset: readonly JudgeFlagCategory[] =
  SUITABILITY_GATE_ALLOWLIST.filter((c) => JUDGE_FLAG_CATEGORIES.includes(c));
void _allowlistIsSubset;

/**
 * Pure policy: should THIS verdict block the reply for a minor?
 *
 * True iff overall === 'violation' AND at least one flag is NOT allowlisted.
 * A 'concern', an 'ok', or a 'violation' whose flags are exclusively
 * `over_blocking` / `topic_drift` all return false.
 */
export function shouldBlockSuitabilityVerdict(verdict: JudgeVerdict): boolean {
  if (verdict.overall !== 'violation') return false;
  return verdict.flags.some(
    (flag) => !SUITABILITY_GATE_ALLOWLIST.includes(flag),
  );
}

/**
 * The safe reply shown when the enforcing gate fires. Declines to surface the
 * unsuitable content while KEEPING the door open — it does not wall the learner
 * off, it invites them to steer somewhere the mentor can help. English-only in
 * this first pass, matching the dangerous-procedure / safety-tripwire fallback
 * rationale (a safe English message beats a mistranslated safety message; the
 * structured event fires regardless).
 */
export function suitabilityRefusalResponse(): string {
  return (
    "Let's keep this somewhere I can genuinely help. I don't want to go " +
    "further down that path, but I'm glad to switch to the schoolwork, the " +
    'idea behind it, or anything you actually want to understand — just point ' +
    "me at it and we'll dig in."
  );
}

export interface SuitabilityGateResult {
  /** Reply to show/persist — the safe refusal on a block, else the input reply. */
  response: string;
  /** True when the reply was replaced because of a blocking verdict. */
  blocked: boolean;
  /**
   * True when NO verdict was available (judge degraded/unavailable) — the reply
   * PASSED (fail open). The caller must raise the operator alarm on this.
   */
  unavailable: boolean;
  /**
   * The verdict's flag categories when `blocked` is true (for the blocked
   * event's fire-rate / false-positive monitoring); empty otherwise. Never the
   * rationale text (which can quote the reply).
   */
  blockedFlags: JudgeFlagCategory[];
}

/**
 * Pure decision. Age-scoped by the caller (`isMinor`). Given a resolved verdict
 * (or `null` when the judge was unavailable), decide whether to block-and-replace.
 *
 * - Adult (`isMinor: false`)      → pass, never judged.
 * - `verdict === null`            → PASS (fail open), `unavailable: true`.
 * - blocking verdict              → safe refusal, `blocked: true`.
 * - non-blocking verdict          → pass.
 */
export function applySuitabilityGate(
  reply: string,
  verdict: JudgeVerdict | null,
  opts: { isMinor: boolean },
): SuitabilityGateResult {
  if (!opts.isMinor) {
    return {
      response: reply,
      blocked: false,
      unavailable: false,
      blockedFlags: [],
    };
  }
  if (verdict === null) {
    // Fail OPEN — a judge that cannot decide is not evidence the reply is
    // unsafe. The caller emits the alarm off `unavailable`.
    return {
      response: reply,
      blocked: false,
      unavailable: true,
      blockedFlags: [],
    };
  }
  if (!shouldBlockSuitabilityVerdict(verdict)) {
    return {
      response: reply,
      blocked: false,
      unavailable: false,
      blockedFlags: [],
    };
  }
  return {
    response: suitabilityRefusalResponse(),
    blocked: true,
    unavailable: false,
    blockedFlags: verdict.flags,
  };
}

export interface SuitabilityEnforcementInput {
  /** `JUDGE_ENFORCEMENT_ENABLED` resolved for this request. Inert when false. */
  enabled: boolean;
  /** Minor scope — caller fail-closes an unknown age to `true`. */
  isMinor: boolean;
  /** The final candidate reply (post deterministic gates) under review. */
  reply: string;
  /** Immediately-preceding learner message, or null when the reply opens. */
  precedingLearnerMessage: string | null;
  /** Coarse age band — frames the judge's age-appropriateness rubric. */
  ageBracket: AgeBracket;
  /** The tutor model's vendor — the judge must not share it (§2). */
  tutorVendor: string | undefined;
  conversationLanguage?: ConversationLanguage;
  sessionId?: string;
}

/**
 * Async orchestrator: when enabled AND the learner is a minor, run the judge
 * synchronously and apply the pure gate to its verdict. Inert (returns the
 * reply unchanged) when the flag is off or the learner is an adult — the judge
 * is never called in those cases, so first-token latency and cost are unaffected
 * for the non-enforced paths. Never throws: `runSuitabilityJudge` already fails
 * open to null, which this maps to `unavailable`.
 */
export async function runSuitabilityEnforcement(
  input: SuitabilityEnforcementInput,
): Promise<SuitabilityGateResult> {
  if (!input.enabled || !input.isMinor) {
    return {
      response: input.reply,
      blocked: false,
      unavailable: false,
      blockedFlags: [],
    };
  }
  // The judge's vendor-independence (§2) is resolved from the tutor vendor.
  // Without a known tutor vendor we cannot run a valid judge → fail OPEN with
  // alarm rather than block on a guess.
  if (!input.tutorVendor) {
    return {
      response: input.reply,
      blocked: false,
      unavailable: true,
      blockedFlags: [],
    };
  }

  const verdict = await runSuitabilityJudge({
    reply: input.reply,
    precedingLearnerMessage: input.precedingLearnerMessage,
    ageBracket: input.ageBracket,
    conversationLanguage: input.conversationLanguage,
    tutorVendor: input.tutorVendor,
    sessionId: input.sessionId,
  });

  return applySuitabilityGate(input.reply, verdict, { isMinor: input.isMinor });
}
