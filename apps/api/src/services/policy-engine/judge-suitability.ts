// ---------------------------------------------------------------------------
// Suitability-judge service (MMT-ADR-0016 §2 — vendor-independent, non-reasoning
// judge). Phase 4 increment 1: post-display, calibration-only.
//
// Builds the model-agnostic rubric prompt, routes it to a vendor-independent
// provider, and parses a structured verdict. Fails OPEN (§5): any error returns
// null and logs a structured degraded warning; the Inngest handler turns a null
// return into the `judge.degraded` metric. A judge failure never throws into the
// learner's exchange.
// ---------------------------------------------------------------------------

import {
  judgeVerdictSchema,
  type AgeBracket,
  type ConversationLanguage,
  type JudgeVerdict,
} from '@eduagent/schemas';
import { extractFirstJsonObject, routeAndCall } from '../llm';
import type { PreferredLlmProvider } from '../llm';
import { createLogger } from '../logger';
import { resolveJudgeConfig } from './judge';
import { buildSuitabilityJudgePrompt } from './judge-suitability-prompt';

const logger = createLogger();

/** Router flow label — drives the per-flow dashboards and the judge routing slot. */
export const JUDGE_SUITABILITY_FLOW = 'judge.suitability';

// The judge is a cheap, non-reasoning classifier — lowest escalation rung.
const JUDGE_RUNG = 1;

export interface RunSuitabilityJudgeInput {
  /** Tutor reply under review. */
  reply: string;
  /** Immediately-preceding learner message, or null when the reply opens the exchange. */
  precedingLearnerMessage: string | null;
  /** Coarse age band — frames age-appropriateness. */
  ageBracket: AgeBracket;
  /** Language the exchange is in (router i18n tripwire wants this alongside `flow`). */
  conversationLanguage?: ConversationLanguage;
  /** The tutor model's vendor — the judge must not share it (§2). */
  tutorVendor: string;
  /** Optional session id for correlation / per-flow metrics. */
  sessionId?: string;
}

/**
 * Pick a judge provider that is vendor-independent of the tutor (MMT-ADR-0016
 * §2). Consults `resolveJudgeConfig`'s `!<vendor>` constraint so the scaffold's
 * invariant drives the pick. Prefers Anthropic (Haiku — master.md judge row);
 * falls to OpenAI only when Anthropic is the excluded vendor. Never Gemini
 * (under-18 + judge-vendor constraint).
 */
export function selectJudgeProvider(tutorVendor: string): PreferredLlmProvider {
  const { vendorConstraint } = resolveJudgeConfig({ tutorVendor });
  const excluded = vendorConstraint.replace(/^!/, '').trim().toLowerCase();
  const preferred: PreferredLlmProvider = 'anthropic';
  return excluded === preferred ? 'openai' : preferred;
}

/**
 * Run the post-display suitability judge over a single tutor reply. Returns the
 * parsed verdict, or null on any failure (fail-open). Never throws.
 */
export async function runSuitabilityJudge(
  input: RunSuitabilityJudgeInput,
): Promise<JudgeVerdict | null> {
  const preferredProvider = selectJudgeProvider(input.tutorVendor);

  const messages = buildSuitabilityJudgePrompt({
    reply: input.reply,
    precedingLearnerMessage: input.precedingLearnerMessage,
    ageBracket: input.ageBracket,
    conversationLanguage: input.conversationLanguage,
  });

  let response: string;
  try {
    const result = await routeAndCall(messages, JUDGE_RUNG, {
      capability: 'judge',
      flow: JUDGE_SUITABILITY_FLOW,
      preferredProvider,
      ageBracket: input.ageBracket,
      conversationLanguage: input.conversationLanguage,
      responseFormat: 'json',
      sessionId: input.sessionId,
    });
    response = result.response;
  } catch (error) {
    logger.warn('[judge-suitability] degraded — route error', {
      reason: 'route_error',
      flow: JUDGE_SUITABILITY_FLOW,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const jsonText = extractFirstJsonObject(response);
  if (!jsonText) {
    logger.warn('[judge-suitability] degraded — no JSON object in response', {
      reason: 'no_json',
      flow: JUDGE_SUITABILITY_FLOW,
    });
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    logger.warn('[judge-suitability] degraded — JSON parse failed', {
      reason: 'json_parse_error',
      flow: JUDGE_SUITABILITY_FLOW,
    });
    return null;
  }

  const verdict = judgeVerdictSchema.safeParse(raw);
  if (!verdict.success) {
    logger.warn('[judge-suitability] degraded — verdict failed schema', {
      reason: 'invalid_verdict',
      flow: JUDGE_SUITABILITY_FLOW,
      issues: verdict.error.issues.map((issue) => issue.path.join('.')),
    });
    return null;
  }

  return verdict.data;
}
