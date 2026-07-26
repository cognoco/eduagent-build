// ---------------------------------------------------------------------------
// Challenge Round grader service (2026-06-26 plan T5).
//
// Calls the judge (a vendor-independent, non-reasoning LLM) to grade the
// learner's answer to the most recent mentor question. Returns a
// ChallengeRoundEvaluationItem[] with the server-owned answerEventId injected
// — the model only emits judgment fields.
//
// Fail-open contract (mirrors runSuitabilityJudge in policy-engine/):
//   - Any failure (route error / no-JSON / parse error / schema invalid) returns
//     [] and emits a safeSend-wrapped Inngest observability event named
//     `app/challenge-round.grader_degraded` (opaque ids + reason code only —
//     never learner text). AGENTS.md: "silent recovery without escalation is
//     banned" — the degraded event is the mandatory escalation path.
//   - Never throws into the caller (the caller is the mastery evaluation path).
// ---------------------------------------------------------------------------

import {
  challengeRoundGraderDegradedEventSchema,
  challengeRoundGraderVerdictSchema,
  type AgeBracket,
  type ChallengeRoundEvaluationItem,
  type ChallengeRoundQuestionIdentity,
  type ConversationLanguage,
} from '@eduagent/schemas';
import { inngest } from '../../inngest/client';
import { createLogger } from '../logger';
import { extractFirstJsonObject, routeAndCall } from '../llm';
import { safeSend } from '../safe-non-core';
import { buildChallengeRoundGraderPrompt } from './grader-prompt';

const logger = createLogger();

/**
 * Router flow label — drives per-flow dashboards and the judge routing slot.
 * Matches the plan spec (T5): 'challenge.grader'.
 */
export const GRADER_FLOW = 'challenge.grader';

/** Lowest escalation rung — the judge is a non-reasoning, cheap classifier. */
const GRADER_RUNG = 1;

/** Inngest event name for grader degradation. Must match the schema name. */
const GRADER_DEGRADED_EVENT = 'app/challenge-round.grader_degraded';

export interface RunChallengeRoundGraderInput {
  /** Owning profile — required (the grader fires mid-session; profile exists). */
  profileId: string;
  /** The mentor's question the learner was answering (used as grading context). */
  askedQuestion: string;
  /** The learner's verbatim answer. */
  learnerAnswer: string;
  /** Earlier Challenge identities, in round order, for novelty classification. */
  priorQuestionIdentities?: ChallengeRoundQuestionIdentity[];
  /** Server-owned event id — injected into every returned item; never sent to the model. */
  answerEventId: string;
  /** Language for learner-facing fields in the verdict. */
  conversationLanguage?: ConversationLanguage;
  /** Coarse age band — calibrates grader tone. */
  ageBracket: AgeBracket;
  /** Optional session id for correlation / per-flow metrics. */
  sessionId?: string;
  /**
   * [WI-2670] The REAL vendor that produced `askedQuestion` — the caller
   * (session-exchange.ts's `resolveAskedQuestion`) reads it back from that
   * turn's persisted `llmProvider`, never from the current turn's own
   * routing decision (the two can diverge after a mid-session provider
   * fallback). Declared to the router as `JudgeIndependence`
   * mode:'model-output' so the grader is never selected from the same
   * vendor that produced the question it grades.
   *
   * Optional because the caller cannot always resolve it (e.g. a legacy
   * `ai_response` row persisted before per-turn vendor tracking existed) —
   * see the `producer_vendor_unresolved` fail-open branch below. The grader
   * never fabricates a vendor to fill this in.
   */
  producerVendor?: string;
}

type DegradedReason =
  | 'route_error'
  | 'no_json'
  | 'parse_error'
  | 'schema_invalid'
  | 'producer_vendor_unresolved';

async function emitDegradedEvent(
  reason: DegradedReason,
  input: Pick<
    RunChallengeRoundGraderInput,
    'profileId' | 'sessionId' | 'answerEventId'
  >,
): Promise<void> {
  const payload = challengeRoundGraderDegradedEventSchema.parse({
    profileId: input.profileId,
    sessionId: input.sessionId,
    answerEventId: input.answerEventId,
    timestamp: new Date().toISOString(),
    reason,
  });

  await safeSend(
    () =>
      inngest.send({
        // orphan-allow: observability-only event — the grader degraded path
        // recovers to [] and escalates via logger.warn + this event.
        // No remediation handler is required; the event feeds the degraded-rate
        // dashboard (AGENTS.md "silent recovery without escalation is banned").
        name: GRADER_DEGRADED_EVENT,
        data: payload,
      }),
    'challenge-round.grader_degraded',
    { reason, sessionId: input.sessionId },
  );
}

/**
 * Grade the learner's answer to the most recent mentor question.
 *
 * Returns a `ChallengeRoundEvaluationItem[]` with `answerEventId` injected
 * server-side. Returns `[]` on any failure (fail-open) and emits a structured
 * observability event — never throws.
 */
export async function runChallengeRoundGrader(
  input: RunChallengeRoundGraderInput,
): Promise<ChallengeRoundEvaluationItem[]> {
  // 0. [WI-2670] Never fabricate a producerVendor. If the caller could not
  //    provably identify who produced the graded question (e.g. a legacy
  //    ai_response row predating per-turn vendor tracking — should not
  //    happen for any row written after this WI), fail open the same way
  //    every other degradation does: structured Inngest event with a
  //    distinct reason code (feeds the degraded-rate dashboard — AGENTS.md
  //    "silent recovery without escalation is banned"), never a bare
  //    console warn standing in for real observability. No routeAndCall is
  //    attempted — there is no safe way to declare JudgeIndependence
  //    without a real vendor to exclude.
  if (!input.producerVendor) {
    logger.warn(
      '[challenge-round.grader] degraded — producer vendor unresolved',
      {
        reason: 'producer_vendor_unresolved',
        flow: GRADER_FLOW,
      },
    );
    await emitDegradedEvent('producer_vendor_unresolved', input);
    return [];
  }

  const messages = buildChallengeRoundGraderPrompt({
    askedQuestion: input.askedQuestion,
    learnerAnswer: input.learnerAnswer,
    priorQuestionIdentities: input.priorQuestionIdentities,
    conversationLanguage: input.conversationLanguage,
    ageBracket: input.ageBracket,
  });

  // 1. Route to the judge (capability:'judge' selects the tier/age-blind
  //    grader path — exempt from the under-18 Gemini-ban gate, WI-1800).
  //
  // [WI-2670] This grades the LEARNER's answer, but is judged against
  // `askedQuestion` — the mentor's own prior turn, i.e. tutor output. The
  // caller (session-exchange.ts's `resolveAskedQuestion`) threads the REAL
  // vendor that produced that prior turn, read back from its persisted
  // `llmProvider` — never the current turn's own routing decision, which can
  // diverge after a mid-session provider fallback. Declaring `model-output`
  // excludes that vendor from judge selection (MMT-ADR-0016 §2), closing the
  // one reachable producer-judges-own-output site on the production-default
  // config (LLM_ROUTING_V2_ENABLED off) that WI-2624 deferred.
  let response: string;
  try {
    const result = await routeAndCall(messages, GRADER_RUNG, {
      capability: 'judge',
      judgeIndependence: {
        mode: 'model-output',
        producerVendor: input.producerVendor,
      },
      flow: GRADER_FLOW,
      responseFormat: 'json',
      conversationLanguage: input.conversationLanguage,
      ageBracket: input.ageBracket,
      sessionId: input.sessionId,
    });
    response = result.response;
  } catch (error) {
    logger.warn('[challenge-round.grader] degraded — route error', {
      reason: 'route_error',
      flow: GRADER_FLOW,
      message: error instanceof Error ? error.message : String(error),
    });
    await emitDegradedEvent('route_error', input);
    return [];
  }

  // 2. Extract the first JSON object from the response (handles code fences /
  //    leading prose from misconfigured models).
  const jsonText = extractFirstJsonObject(response);
  if (!jsonText) {
    logger.warn(
      '[challenge-round.grader] degraded — no JSON object in response',
      {
        reason: 'no_json',
        flow: GRADER_FLOW,
      },
    );
    await emitDegradedEvent('no_json', input);
    return [];
  }

  // 3. Parse JSON.
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    logger.warn('[challenge-round.grader] degraded — JSON parse failed', {
      reason: 'parse_error',
      flow: GRADER_FLOW,
    });
    await emitDegradedEvent('parse_error', input);
    return [];
  }

  // 4. Validate against the grader verdict schema (min(1) guards the exact
  //    gpt-oss failure mode: a model that returns items:[]).
  const verdict = challengeRoundGraderVerdictSchema.safeParse(raw);
  if (!verdict.success) {
    logger.warn('[challenge-round.grader] degraded — verdict failed schema', {
      reason: 'schema_invalid',
      flow: GRADER_FLOW,
      issues: verdict.error.issues.map((issue) => issue.path.join('.')),
    });
    await emitDegradedEvent('schema_invalid', input);
    return [];
  }

  // 5. Inject the server-owned answerEventId and bind the exact asked-question
  //    text into the semantic identity. The model supplies the structured
  //    claim/operation/context, but cannot rewrite which question was asked.
  return verdict.data.items.map((item) => ({
    ...item,
    answerEventId: input.answerEventId,
    ...(item.questionIdentity
      ? {
          questionIdentity: {
            ...item.questionIdentity,
            questionText: input.askedQuestion,
          },
        }
      : {}),
  }));
}
