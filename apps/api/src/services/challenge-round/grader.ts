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
  /** Server-owned event id — injected into every returned item; never sent to the model. */
  answerEventId: string;
  /** Language for learner-facing fields in the verdict. */
  conversationLanguage?: ConversationLanguage;
  /** Coarse age band — calibrates grader tone. */
  ageBracket: AgeBracket;
  /** Optional session id for correlation / per-flow metrics. */
  sessionId?: string;
}

type DegradedReason =
  | 'route_error'
  | 'no_json'
  | 'parse_error'
  | 'schema_invalid';

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
  const messages = buildChallengeRoundGraderPrompt({
    askedQuestion: input.askedQuestion,
    learnerAnswer: input.learnerAnswer,
    conversationLanguage: input.conversationLanguage,
    ageBracket: input.ageBracket,
  });

  // 1. Route to the judge (capability:'judge' selects the tier/age-blind
  //    grader path — exempt from the under-18 Gemini-ban gate, WI-1800).
  //
  // WI-2624 DEFERRED, TRACKED, GATED (not forgotten):
  //
  // This grades the LEARNER's answer, but is judged against `askedQuestion`
  // — the mentor's own prior turn, i.e. tutor output. This is the one
  // reachable producer-judges-own-output site on the production-default
  // config (LLM_ROUTING_V2_ENABLED off). AC-3 calls for `model-output`
  // independence (excluding whichever vendor produced that prior turn), but
  // no REAL producer vendor is cleanly threadable here today:
  // `askedQuestion` is sourced from `context.exchangeHistory` (session-
  // exchange.ts, T6), and history entries carry only `{ role, content,
  // orphan_reason }` — no per-turn vendor is persisted or threaded. The
  // current turn's own `result.provider` (session-exchange.ts) is NOT a
  // substitute — it is the vendor for THIS turn's response, not the vendor
  // that produced the PRIOR turn's question, and can differ from it (e.g. a
  // mid-session provider fallback). Guessing would reintroduce exactly the
  // kind of silent mislabeling WI-2624 exists to remove, so this site is
  // left `not-applicable` (no producer exclusion, Gemini/Vertex still
  // banned) rather than a false `model-output` declaration.
  //
  // Follow-up: WI-2670 ("Thread per-turn producer vendor through exchange
  // history and apply producer-exclusion to the Challenge Round grader").
  // Owner: BID-35 / shepherd:claude:mentor-notice. Gate (not a calendar
  // date): must land before BID-35 batch graduation — WI-2670 is wired
  // Blocking→WI-2574, so the zero-open re-audit enforces it. Do not
  // reclassify this call site without landing WI-2670 first.
  let response: string;
  try {
    const result = await routeAndCall(messages, GRADER_RUNG, {
      capability: 'judge',
      judgeIndependence: { mode: 'not-applicable' },
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
