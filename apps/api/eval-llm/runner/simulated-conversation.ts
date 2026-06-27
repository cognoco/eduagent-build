import { createHash } from 'node:crypto';
import type {
  ChallengeRoundEvaluationItem,
  ChallengeRoundSessionState,
} from '@eduagent/schemas';
import {
  buildExchangeSourceEvidence,
  buildSystemPrompt,
  type ExchangeContext,
} from '../../src/services/exchanges';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import { MAX_CHALLENGE_QUESTIONS } from '../../src/services/challenge-round/caps';
import {
  decideMasteryAndReview,
  type MasteryDecision,
} from '../../src/services/challenge-round/evaluation';
import { transitionChallengeState } from '../../src/services/challenge-round/state';
import { parseEnvelope } from '../../src/services/llm/envelope';
import { getModelConfigForTest } from '../../src/services/llm/router';
import type { ChatMessage } from '../../src/services/llm/types';
import type { ChallengeSimScenario } from '../fixtures/challenge-personas';
import type { EvalProfile } from '../fixtures/profiles';
import { runHarnessLlm } from './llm-client';
import {
  runLearnerTurn,
  type LearnerHistoryEntry,
  type LearnerTurnArgs,
} from './learner-agent';

// ---------------------------------------------------------------------------
// Simulated Challenge-Round driver.
//
// Drives a non-scripted, multi-turn round: one LLM plays the learner (pinned
// OpenRouter slug, hidden competence brief), the REAL mentor pipeline
// (buildSystemPrompt → runHarnessLlm) responds, and the pure state machine +
// pure mastery gate run in-memory, DB-free. The gate's outcome is compared to
// the scenario's ground-truth `expectedOutcome` to make over-/under-credit
// measurable.
//
// DB-free by design: `decideMasteryAndReview` is pure and runs for real; the
// production-only `validateEvaluationEventIds` (DB lookup) is intentionally NOT
// called — there is no seeded DB. The simulator measures the LLM contract + the
// mastery decision, not the DB-anchoring step.
// ---------------------------------------------------------------------------

/** The mentor turn runs at rung 3, mirroring flows/challenge-round-mastery.ts. */
const MENTOR_RUNG = 3 as const;

/**
 * The tier the mentor turn routes at. Must stay in lockstep with
 * `buildMentorContext`'s `llmTier` so the production-routing guard
 * (`resolveProductionMentorModel`) resolves the exact model the turn will use.
 */
const MENTOR_LLM_TIER = 'standard' as const;

export interface SimulatedRoundResult {
  scenarioId: string;
  profileId: string;
  /** 'production-routing' or the explicit candidate slug. */
  mentorModel: string;
  learnerModel: string;
  transcript: Array<{ role: 'assistant' | 'user'; content: string }>;
  /** Accumulated across all answered turns. */
  evaluations: ChallengeRoundEvaluationItem[];
  decision: MasteryDecision;
  expectedOutcome: ChallengeSimScenario['expectedOutcome'];
  /** false if any active turn's parseEnvelope failed OR returned 0 eval items. */
  signalEmitted: boolean;
}

export interface RunSimulatedRoundArgs {
  scenario: ChallengeSimScenario;
  profile: EvalProfile;
  /** Pinned learner OpenRouter slug. */
  learnerModel: string;
  /** null = production routing via runHarnessLlm; a slug = explicit candidate. */
  mentorModel: string | null;
  /** Override the heuristic same-base-family guard for a deliberate A/B. */
  allowSameFamily?: boolean;
}

/**
 * Dependency-injection seam for tests: replace the two LLM boundaries directly
 * (no internal jest.mock — GC1-clean). Defaults wire the real implementations.
 */
export interface SimulatedRoundOverrides {
  learnerTurn?: (args: LearnerTurnArgs) => Promise<string>;
  /** Returns the mentor's raw LLM response string (an envelope, ideally). */
  mentorTurn?: (ctx: ExchangeContext, learnerAnswer: string) => Promise<string>;
}

/**
 * Stable v4-format UUID derived from a seed — answerEventId / topicId both
 * require `.uuid()`, and determinism keeps transcripts addressable + re-runnable.
 */
export function deterministicUuid(seed: string): string {
  const hex = createHash('sha1').update(seed).digest('hex');
  const variantNibble = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const v4 =
    hex.slice(0, 12) +
    '4' +
    hex.slice(13, 16) +
    variantNibble +
    hex.slice(17, 32);
  return `${v4.slice(0, 8)}-${v4.slice(8, 12)}-${v4.slice(12, 16)}-${v4.slice(16, 20)}-${v4.slice(20, 32)}`;
}

/**
 * Heuristic base-family token: strip the provider prefix and trailing size/date/
 * variant suffixes, then keep the first two meaningful segments. Same underlying
 * model served under two slugs (e.g. `openai/gpt-oss-120b` vs `gpt-oss-120b`)
 * collapses to the same family — necessary but not sufficient, hence heuristic.
 */
export function modelFamily(slug: string): string {
  const afterProvider =
    slug.toLowerCase().split('/').pop() ?? slug.toLowerCase();
  const tokens = afterProvider.split(/[-_]/).filter(
    (t) =>
      t.length > 0 &&
      !/^\d+[bm]?$/.test(t) && // sizes: 120b, 7b, 8m
      !/^\d{6,}$/.test(t) && // date stamps
      !['latest', 'preview', 'instruct', 'chat', 'it'].includes(t),
  );
  return tokens.slice(0, 2).join('-');
}

/**
 * Two-model guard: refuse to run when the learner and grader are the same model
 * (or share a base family, heuristically) — correlated errors would inflate the
 * `solid` rate and yield a falsely lenient bar.
 */
export function assertTwoModelGuard(
  learnerModel: string,
  mentorModel: string,
  allowSameFamily: boolean,
): void {
  if (learnerModel === mentorModel) {
    throw new Error(
      `two-model guard: learner and mentor are the same model (${learnerModel}). ` +
        'The grader must differ from the learner or correlated errors inflate the solid rate.',
    );
  }
  if (!allowSameFamily) {
    const lf = modelFamily(learnerModel);
    const mf = modelFamily(mentorModel);
    if (lf.length > 0 && lf === mf) {
      throw new Error(
        `two-model guard (heuristic): learner (${learnerModel}) and mentor (${mentorModel}) ` +
          `share base family "${lf}". This is a heuristic slug/family check; pass ` +
          'allowSameFamily / --allow-same-family for a deliberate same-family A/B.',
      );
    }
  }
}

/**
 * Resolve the concrete model the production router would use for the mentor rung
 * for THIS profile. Age-dependent on purpose: minors route to a different
 * (approved non-Gemini) model than the age-unknown default
 * (`router.ts` `isUnder18AgeBracket` → `approvedTextFallbackConfig`). Every sim
 * scenario is a minor, so resolving WITHOUT the age bracket would validate the
 * guard against the wrong model and let learner == real-grader slip through —
 * defeating the guard. Mirror the mentor turn's routing inputs exactly:
 * `llmTier` from `buildMentorContext` ('standard') and the profile's bracket.
 */
function resolveProductionMentorModel(profile: EvalProfile): string {
  return getModelConfigForTest(MENTOR_RUNG, {
    llmTier: MENTOR_LLM_TIER,
    ageBracket: resolveAgeBracket(profile.birthYear),
  }).model;
}

function toExchangeHistory(
  transcript: Array<{ role: 'assistant' | 'user'; content: string }>,
): ExchangeContext['exchangeHistory'] {
  return transcript.map((t) => ({ role: t.role, content: t.content }));
}

function buildMentorContext(params: {
  scenario: ChallengeSimScenario;
  profile: EvalProfile;
  challengeRound: ChallengeRoundSessionState;
  exchangeHistory: ExchangeContext['exchangeHistory'];
  currentEventId: string;
}): ExchangeContext {
  return {
    sessionId: `eval-sim-${params.scenario.id}`,
    profileId: `eval-profile-${params.profile.id}`,
    subjectName: params.scenario.subjectName,
    topicTitle: params.scenario.topicTitle,
    topicDescription: params.scenario.topicDescription,
    sessionType: 'learning',
    escalationRung: MENTOR_RUNG,
    exchangeHistory: params.exchangeHistory,
    birthYear: params.profile.birthYear,
    exchangeCount: 6,
    inputMode: 'text',
    llmTier: MENTOR_LLM_TIER,
    challengeRuntimeEnabled: true,
    challengeRound: params.challengeRound,
    currentUserMessageEventId: params.currentEventId,
  };
}

async function defaultMentorTurn(
  ctx: ExchangeContext,
  learnerAnswer: string,
): Promise<string> {
  const sourceEvidence = buildExchangeSourceEvidence(ctx, learnerAnswer);
  const system = buildSystemPrompt({ ...ctx, sourceEvidence });
  const rung = (ctx.escalationRung ?? MENTOR_RUNG) as 1 | 2 | 3 | 4 | 5;
  return runHarnessLlm(
    [
      { role: 'system', content: system },
      { role: 'user', content: learnerAnswer },
    ] satisfies ChatMessage[],
    rung,
    {
      llmTier: ctx.llmTier,
      ageBracket: resolveAgeBracket(ctx.birthYear),
      responseFormat: 'json',
      sessionId: `eval-sim-${ctx.sessionId}`,
    },
  );
}

export async function runSimulatedRound(
  args: RunSimulatedRoundArgs,
  overrides: SimulatedRoundOverrides = {},
): Promise<SimulatedRoundResult> {
  const { scenario, profile, learnerModel, allowSameFamily = false } = args;

  // Two-model guard FIRST — before any LLM call. The null (production-routing)
  // case still resolves the concrete mentor slug and applies the same check.
  const mentorModelLabel = args.mentorModel ?? 'production-routing';
  const mentorGuardSlug =
    args.mentorModel ?? resolveProductionMentorModel(profile);
  assertTwoModelGuard(learnerModel, mentorGuardSlug, allowSameFamily);

  const learnerTurn = overrides.learnerTurn ?? runLearnerTurn;
  const mentorTurn = overrides.mentorTurn ?? defaultMentorTurn;

  // Seed via the REAL transitions so totalQuestions is set (a state missing it
  // routes straight to drafting after one turn — state.ts FCR-2026-05-23).
  let state = transitionChallengeState(undefined, {
    type: 'offer',
    topicId: deterministicUuid(`${scenario.id}:topic`),
  });
  state = transitionChallengeState(state, { type: 'accept' });
  state = transitionChallengeState(state, {
    type: 'start',
    totalQuestions: MAX_CHALLENGE_QUESTIONS,
  });

  const transcript: Array<{ role: 'assistant' | 'user'; content: string }> = [
    { role: 'assistant', content: scenario.seedQuestion },
  ];
  const learnerHistory: LearnerHistoryEntry[] = [];
  const allEvals: ChallengeRoundEvaluationItem[] = [];

  let mentorQuestion = scenario.seedQuestion;
  let signalEmitted = true;
  let turnIndex = 0;

  while (state?.state === 'active' && turnIndex < MAX_CHALLENGE_QUESTIONS) {
    // 1. Learner answers the current question (history excludes this turn).
    const learnerAnswer = await learnerTurn({
      scenario,
      profile,
      mentorQuestion,
      history: [...learnerHistory],
      learnerModel,
    });

    // 2. Mentor turn — exchangeHistory ends with the mentor question; the
    //    current answer is passed as the user message, not via history.
    const ctx = buildMentorContext({
      scenario,
      profile,
      challengeRound: state,
      exchangeHistory: toExchangeHistory(transcript),
      currentEventId: deterministicUuid(`${scenario.id}:q${turnIndex}`),
    });

    transcript.push({ role: 'user', content: learnerAnswer });
    learnerHistory.push({ role: 'mentor', content: mentorQuestion });
    learnerHistory.push({ role: 'learner', content: learnerAnswer });

    const rawMentor = await mentorTurn(ctx, learnerAnswer);

    // 3. PRODUCTION envelope path: an ok:false result is a dropped signal,
    //    exactly as exchanges.ts treats it. No reply text → cannot continue.
    const parsed = parseEnvelope(rawMentor, 'exchange.session');
    if (!parsed.ok) {
      signalEmitted = false;
      break;
    }
    transcript.push({ role: 'assistant', content: parsed.envelope.reply });

    const evals = parsed.envelope.signals?.challenge_round_evaluation ?? [];
    if (evals.length === 0) {
      signalEmitted = false;
    }
    allEvals.push(...evals);

    // 4. Advance the state machine with the (possibly empty) evaluation.
    state = transitionChallengeState(state, {
      type: 'answer_complete',
      evaluation: evals,
    });

    mentorQuestion = parsed.envelope.reply;
    turnIndex += 1;
  }

  // Drive to completion from drafting (normal) or active (early break / cap).
  if (state && (state.state === 'drafting' || state.state === 'active')) {
    state = transitionChallengeState(state, { type: 'complete' });
  }

  const decision = decideMasteryAndReview(allEvals);

  return {
    scenarioId: scenario.id,
    profileId: profile.id,
    mentorModel: mentorModelLabel,
    learnerModel,
    transcript,
    evaluations: allEvals,
    decision,
    expectedOutcome: scenario.expectedOutcome,
    signalEmitted,
  };
}
