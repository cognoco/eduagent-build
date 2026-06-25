import {
  buildExchangeSourceEvidence,
  buildSystemPrompt,
  type ExchangeContext,
} from '../../src/services/exchanges';
import { llmResponseEnvelopeSchema } from '@eduagent/schemas';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import type { EvalProfile } from '../fixtures/profiles';
import type {
  FlowDefinition,
  PromptMessages,
  QualityIssue,
  Scenario,
} from '../runner/types';
import { runHarnessLlm } from '../runner/llm-client';
import {
  parseFirstJsonObject,
  qualityError,
  qualityWarning,
} from '../runner/quality';

// ---------------------------------------------------------------------------
// Flow adapter — Challenge Round mastery evidence
//
// The Challenge Round is the product's "did you actually master it?" gate. The
// server (`services/challenge-round/evaluation.ts:decideMasteryAndReview`) is
// conservative over structured LLM evidence: it sets mastery ONLY when every
// concept the LLM scored is `solid`, and routes any `partial`/`misconception`
// to weak-spot remediation. That server logic is unit-tested — but nothing
// exercised the LLM SIDE of the contract: when a Challenge Round is active,
// does the model actually emit a well-formed `signals.challenge_round_evaluation`
// item, anchored to the correct answer event id, grounded in the learner's
// words, AND correctly REFUSE to score a confident-but-wrong or vague answer
// `solid`? A model that rubber-stamps a misconception as `solid` would defeat
// the entire conservative gate. This flow closes that gap.
//
// Two-model note: the mentor turn goes through `runHarnessLlm` so a
// `--openrouter-model` candidate override applies (this is part of the §6
// candidate gate). There is no separate judge — the assertions are
// deterministic checks over the structured evaluation evidence.
// ---------------------------------------------------------------------------

// Fixed, valid UUID used as the current learner-answer event id. The active
// Challenge Round prompt directs the model to use this exact id as the
// `answerEventId` for its evaluation item (exchange-prompts.ts CURRENT
// CHALLENGE ANSWER EVENT ID directive).
const ANSWER_EVENT_ID = '11111111-1111-4111-8111-111111111111';

const BANNED_FRAMING =
  /\b(failed|fail|wrong|incorrect|struggl(?:e|ed|ing)|weak)\b/i;

type ExpectedResult = 'solid' | 'not-solid';

interface ChallengeMasterySpec {
  id: string;
  profileId: string;
  description: string;
  subjectName: string;
  topicTitle: string;
  topicDescription: string;
  /** The assistant's challenge question (deeper "explain why" prompt). */
  challengeQuestion: string;
  /** The learner's answer to that question — the turn under evaluation. */
  learnerAnswer: string;
  /**
   * What a correct evaluation should conclude. `not-solid` scenarios are the
   * load-bearing ones: a confident-but-wrong or vague answer that the model
   * must NOT mark `solid`, or the conservative mastery gate is defeated.
   */
  expected: ExpectedResult;
}

const CHALLENGE_MASTERY_SCENARIOS: ChallengeMasterySpec[] = [
  {
    id: 'CRM01-solid',
    profileId: '12yo-dinosaurs',
    description:
      'Correct "explain why" answer about fossilization — should be scored solid.',
    subjectName: 'Science',
    topicTitle: 'fossilization',
    topicDescription:
      'Fossils often form when remains are buried by sediment. Over time, minerals can replace hard parts such as bones, preserving their shape.',
    challengeQuestion:
      'Here is a tougher one: why does the animal need to be buried quickly for a good fossil to form?',
    learnerAnswer:
      'Because if it is buried fast, scavengers and rotting cannot destroy the bones first, so the shape is still there when minerals slowly soak in and replace it.',
    expected: 'solid',
  },
  {
    id: 'CRM02-misconception',
    profileId: '15yo-football-gaming',
    description:
      'Confident but WRONG reasoning for dividing fractions — must NOT be scored solid.',
    subjectName: 'Mathematics',
    topicTitle: 'dividing fractions',
    topicDescription:
      'Dividing by a fraction is the same as multiplying by its reciprocal, because division asks how many of the divisor fit into the dividend.',
    challengeQuestion:
      'Explain why "flip and multiply" actually works when you divide by a fraction.',
    learnerAnswer:
      'You flip it because dividing always makes the number smaller, so flipping cancels that out and keeps the answer the right size.',
    expected: 'not-solid',
  },
  {
    id: 'CRM03-vague',
    profileId: '13yo-spanish-beginner',
    description:
      'Vague non-answer ("I just get it") — must NOT be scored solid (note drafter excludes vague quotes).',
    subjectName: 'Languages',
    topicTitle: 'ser vs estar',
    topicDescription:
      'Spanish uses "ser" for inherent/permanent traits and "estar" for temporary states and locations.',
    challengeQuestion:
      'In your own words, why would you use "estar" instead of "ser" to say you are tired today?',
    learnerAnswer: 'Yeah I totally get it, it just makes sense to me now.',
    expected: 'not-solid',
  },
];

export interface ChallengeMasteryInput {
  scenarioId: string;
  description: string;
  expected: ExpectedResult;
  learnerAnswer: string;
  context: ExchangeContext;
}

function buildChallengeContext(
  profile: EvalProfile,
  spec: ChallengeMasterySpec,
): ExchangeContext {
  return {
    sessionId: `eval-crm-${spec.id}`,
    profileId: `eval-profile-${profile.id}`,
    subjectName: spec.subjectName,
    topicTitle: spec.topicTitle,
    topicDescription: spec.topicDescription,
    sessionType: 'learning',
    escalationRung: 3,
    exchangeHistory: [{ role: 'assistant', content: spec.challengeQuestion }],
    birthYear: profile.birthYear,
    exchangeCount: 6,
    inputMode: 'text',
    llmTier: 'standard',
    // Activate the Challenge Round prompt block + answer-id directive.
    challengeRuntimeEnabled: true,
    challengeRound: {
      state: 'active',
      offerCount: 1,
      topicId: 'eval-topic',
      declinedDontAskAgain: false,
      evaluations: [],
      questionIndex: 1,
    },
    currentUserMessageEventId: ANSWER_EVENT_ID,
  };
}

// ---------------------------------------------------------------------------
// Quality evaluation over the structured evaluation evidence.
// ---------------------------------------------------------------------------

interface EvaluationItemLike {
  concept?: unknown;
  result?: unknown;
  answerEventId?: unknown;
  learnerQuote?: unknown;
}

interface ChallengeEnvelopeLike {
  reply?: unknown;
  signals?: { challenge_round_evaluation?: unknown };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñüçàèìòùâêîôûäöë\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

/**
 * Deterministic assertions over an active-Challenge-Round mentor turn.
 * Exported for unit testing with synthetic envelopes (no live call needed).
 */
export function evaluateChallengeMastery(
  input: ChallengeMasteryInput,
  liveResponse: string,
): QualityIssue[] {
  const parsed = parseFirstJsonObject<ChallengeEnvelopeLike>(liveResponse);
  if (!parsed || typeof parsed.reply !== 'string') {
    return [
      qualityError(
        `${input.scenarioId}.envelope.parse`,
        'Live response did not contain a parseable envelope with a string reply.',
      ),
    ];
  }

  const issues: QualityIssue[] = [];
  const reply = parsed.reply;

  // Banned failure-framing in the learner-facing reply (challenge prompt rule).
  if (BANNED_FRAMING.test(reply)) {
    issues.push(
      qualityError(
        `${input.scenarioId}.banned-framing`,
        'Challenge Round reply uses banned failure-framing ("failed/wrong/incorrect/struggle/weak").',
      ),
    );
  }

  // One question per turn (soft) — multiple question marks suggests a
  // multi-part question, which the active prompt forbids.
  if ((reply.match(/\?/g)?.length ?? 0) > 1) {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.multi-question`,
        'Active Challenge Round should ask ONE question per turn; reply contains multiple question marks.',
      ),
    );
  }

  const rawEvals = parsed.signals?.challenge_round_evaluation;
  const evals = Array.isArray(rawEvals)
    ? (rawEvals as EvaluationItemLike[])
    : [];

  // The active turn that just received an answer MUST emit per-concept
  // evaluation evidence — otherwise the server has nothing to gate mastery on.
  if (evals.length === 0) {
    issues.push(
      qualityError(
        `${input.scenarioId}.no-evaluation`,
        'Active Challenge Round answer turn must emit signals.challenge_round_evaluation with at least one item.',
      ),
    );
    return issues;
  }

  const answerTokens = new Set(tokenize(input.learnerAnswer));

  for (const item of evals) {
    const result = typeof item.result === 'string' ? item.result : undefined;
    if (
      !result ||
      !['solid', 'partial', 'missing', 'misconception'].includes(result)
    ) {
      issues.push(
        qualityError(
          `${input.scenarioId}.bad-result`,
          `Evaluation item has an invalid result value: ${String(result)}.`,
        ),
      );
      continue;
    }

    // Answer-id anchoring: the prompt directs the model to use the exact
    // current answer event id.
    if (item.answerEventId !== ANSWER_EVENT_ID) {
      issues.push(
        qualityError(
          `${input.scenarioId}.answer-event-id`,
          `Evaluation item answerEventId "${String(
            item.answerEventId,
          )}" does not match the directed current answer id.`,
        ),
      );
    }

    // Grounding: learnerQuote should overlap the actual learner answer (the
    // server replaces it with the real event text, but a quote with zero
    // overlap signals the model is inventing rather than quoting).
    const quote =
      typeof item.learnerQuote === 'string' ? item.learnerQuote : '';
    const quoteOverlap = tokenize(quote).some((w) => answerTokens.has(w));
    if (!quote) {
      issues.push(
        qualityError(
          `${input.scenarioId}.missing-quote`,
          'Evaluation item is missing learnerQuote (required for note grounding).',
        ),
      );
    } else if (!quoteOverlap) {
      issues.push(
        qualityWarning(
          `${input.scenarioId}.quote-ungrounded`,
          `learnerQuote "${quote}" shares no words with the learner's answer.`,
        ),
      );
    }

    // The load-bearing mastery assertion: a confident-but-wrong or vague
    // answer must NOT be scored solid, or the conservative gate is defeated.
    if (input.expected === 'not-solid' && result === 'solid') {
      issues.push(
        qualityError(
          `${input.scenarioId}.over-credited`,
          'Model scored a confident-but-wrong / vague answer as "solid"; the conservative mastery gate would mark mastery on bad evidence.',
        ),
      );
    }
  }

  // For the correct-answer scenario, a model that never finds anything solid
  // is over-conservative — surface it for tuning (warning, not a gate failure).
  if (input.expected === 'solid' && !evals.some((e) => e.result === 'solid')) {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.under-credited`,
        'Correct "explain why" answer was not scored solid by any concept — check for over-conservatism.',
      ),
    );
  }

  return issues;
}

export const challengeRoundMasteryFlow: FlowDefinition<ChallengeMasteryInput> =
  {
    id: 'challenge-round-mastery',
    name: 'Challenge Round mastery evidence',
    sourceFile: 'apps/api/src/services/exchanges.ts:buildSystemPrompt',
    // NOTE: deliberately NOT emitsEnvelope. The flow validates the envelope
    // shape per-sample (expectedResponseSchema) and asserts the evaluation
    // evidence (evaluateQuality), but it is excluded from the aggregate
    // signal-distribution baseline — adding it there would require a live
    // reseed of baseline.json before the key-free --validate-baseline CI guard
    // could pass. The main-loop envelope distribution is already covered by
    // probes / exchanges / safety-probes / language-quality.
    expectedResponseSchema: llmResponseEnvelopeSchema,

    buildPromptInput(): ChallengeMasteryInput | null {
      // Not used — enumerateScenarios fans out instead.
      return null;
    },

    enumerateScenarios(
      profile: EvalProfile,
    ): Array<Scenario<ChallengeMasteryInput>> | null {
      const scenarios: Array<Scenario<ChallengeMasteryInput>> = [];
      for (const spec of CHALLENGE_MASTERY_SCENARIOS) {
        if (spec.profileId !== profile.id) continue;
        scenarios.push({
          scenarioId: spec.id,
          input: {
            scenarioId: spec.id,
            description: spec.description,
            expected: spec.expected,
            learnerAnswer: spec.learnerAnswer,
            context: buildChallengeContext(profile, spec),
          },
        });
      }
      return scenarios.length > 0 ? scenarios : null;
    },

    buildPrompt(input: ChallengeMasteryInput): PromptMessages {
      const sourceEvidence = buildExchangeSourceEvidence(
        input.context,
        input.learnerAnswer,
      );
      const system = buildSystemPrompt({
        ...input.context,
        sourceEvidence,
      });
      return {
        system,
        user: input.learnerAnswer,
        notes: [
          `Challenge-mastery scenario: ${input.scenarioId} — ${input.description}`,
          `expected evaluation: ${input.expected}`,
          `currentUserMessageEventId (directed answerEventId): ${ANSWER_EVENT_ID}`,
          'Tier 2 asserts the model emits a well-formed challenge_round_evaluation item, anchored + grounded, and does not over-credit a wrong/vague answer.',
        ],
      };
    },

    async runLive(
      input: ChallengeMasteryInput,
      messages: PromptMessages,
    ): Promise<string> {
      const rung = (input.context.escalationRung ?? 3) as 1 | 2 | 3 | 4 | 5;
      return runHarnessLlm(
        [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user ?? '' },
        ],
        rung,
        {
          llmTier: input.context.llmTier,
          ageBracket: resolveAgeBracket(input.context.birthYear),
          responseFormat: 'json',
          sessionId: 'eval-challenge-round-mastery',
        },
      );
    },

    evaluateQuality({ input, liveResponse }): QualityIssue[] {
      return evaluateChallengeMastery(input, liveResponse);
    },
  };
