// ---------------------------------------------------------------------------
// Teach-back grader service (WI-1155 B2).
//
// Server-side fallback for the Feynman teach-back rubric. Calls the judge (a
// vendor-independent, non-reasoning LLM) to produce a numeric rubric for the
// learner's teach-back explanation when the tutor model dropped
// `signals.teach_back_assessment`. Prompt-only "mandatory rubric" hardening was
// proven insufficient (dropped 4/4 on the live model), so this is the envelope
// rule's server-side hard cap: the signal is guaranteed even when the LLM never
// emits it. Mirrors `runChallengeRoundGrader`.
//
// Fail-open contract (mirrors runChallengeRoundGrader / runSuitabilityJudge):
//   - Any failure (route error / no-JSON / parse error / schema invalid) returns
//     `undefined` and emits a safeSend-wrapped Inngest observability event named
//     `app/teach-back.grader_degraded` (opaque ids + reason code only — never
//     learner text). AGENTS.md: "silent recovery without escalation is banned"
//     — the degraded event is the mandatory escalation path.
//   - Never throws into the caller (the caller is the exchange persistence path).
// ---------------------------------------------------------------------------

import {
  teachBackGraderDegradedEventSchema,
  teachBackGraderVerdictSchema,
  type AgeBracket,
  type ConversationLanguage,
  type LlmResponseEnvelope,
} from '@eduagent/schemas';
import { inngest } from '../inngest/client';
import { createLogger } from './logger';
import { extractFirstJsonObject, routeAndCall } from './llm';
import { safeSend } from './safe-non-core';
import { buildTeachBackGraderPrompt } from './teach-back-grader-prompt';

const logger = createLogger();

/** Router flow label — drives per-flow dashboards and the judge routing slot. */
export const TEACH_BACK_GRADER_FLOW = 'teach-back.grader';

/** Lowest escalation rung — the judge is a non-reasoning, cheap classifier. */
const GRADER_RUNG = 1;

/** Inngest event name for grader degradation. Must match the schema name. */
const GRADER_DEGRADED_EVENT = 'app/teach-back.grader_degraded';

/** Envelope wire-shape teach-back assessment signal (snake_case). */
type TeachBackAssessmentSignal = NonNullable<
  NonNullable<LlmResponseEnvelope['signals']>['teach_back_assessment']
>;

export interface RunTeachBackGraderInput {
  /** The topic the learner was teaching back (grading context). */
  topic: string;
  /** The learner's verbatim teach-back explanation. */
  learnerExplanation: string;
  /** Language for the learner-facing gap_identified field. */
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
  input: Pick<RunTeachBackGraderInput, 'sessionId'>,
): Promise<void> {
  const payload = teachBackGraderDegradedEventSchema.parse({
    sessionId: input.sessionId,
    reason,
  });

  await safeSend(
    () =>
      inngest.send({
        // orphan-allow: observability-only event — the grader degraded path
        // recovers to `undefined` and escalates via logger.warn + this event.
        // No remediation handler is required; the event feeds the degraded-rate
        // dashboard (AGENTS.md "silent recovery without escalation is banned").
        name: GRADER_DEGRADED_EVENT,
        data: payload,
      }),
    'teach-back.grader_degraded',
    { reason, sessionId: input.sessionId },
  );
}

/**
 * Grade the learner's teach-back explanation into a numeric rubric.
 *
 * Returns the envelope wire-shape `teach_back_assessment` object (snake_case)
 * on success, or `undefined` on any failure (fail-open) after emitting a
 * structured observability event — never throws.
 */
export async function runTeachBackGrader(
  input: RunTeachBackGraderInput,
): Promise<TeachBackAssessmentSignal | undefined> {
  const messages = buildTeachBackGraderPrompt({
    topic: input.topic,
    learnerExplanation: input.learnerExplanation,
    conversationLanguage: input.conversationLanguage,
    ageBracket: input.ageBracket,
  });

  // 1. Route to the judge (capability:'judge' selects the tier/age-blind path).
  let response: string;
  try {
    const result = await routeAndCall(messages, GRADER_RUNG, {
      capability: 'judge',
      flow: TEACH_BACK_GRADER_FLOW,
      responseFormat: 'json',
      conversationLanguage: input.conversationLanguage,
      ageBracket: input.ageBracket,
      sessionId: input.sessionId,
    });
    response = result.response;
  } catch (error) {
    logger.warn('[teach-back.grader] degraded — route error', {
      reason: 'route_error',
      flow: TEACH_BACK_GRADER_FLOW,
      message: error instanceof Error ? error.message : String(error),
    });
    await emitDegradedEvent('route_error', input);
    return undefined;
  }

  // 2. Extract the first JSON object (handles code fences / leading prose).
  const jsonText = extractFirstJsonObject(response);
  if (!jsonText) {
    logger.warn('[teach-back.grader] degraded — no JSON object in response', {
      reason: 'no_json',
      flow: TEACH_BACK_GRADER_FLOW,
    });
    await emitDegradedEvent('no_json', input);
    return undefined;
  }

  // 3. Parse JSON.
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    logger.warn('[teach-back.grader] degraded — JSON parse failed', {
      reason: 'parse_error',
      flow: TEACH_BACK_GRADER_FLOW,
    });
    await emitDegradedEvent('parse_error', input);
    return undefined;
  }

  // 4. Validate against the grader verdict schema (the four numeric scores are
  //    REQUIRED — the whole point of the fallback is a guaranteed rubric).
  const verdict = teachBackGraderVerdictSchema.safeParse(raw);
  if (!verdict.success) {
    logger.warn('[teach-back.grader] degraded — verdict failed schema', {
      reason: 'schema_invalid',
      flow: TEACH_BACK_GRADER_FLOW,
      issues: verdict.error.issues.map((issue) => issue.path.join('.')),
    });
    await emitDegradedEvent('schema_invalid', input);
    return undefined;
  }

  return verdict.data;
}
