import { createHash } from 'node:crypto';
import {
  challengeRoundGraderVerdictSchema,
  conversationLanguageSchema,
  type AgeBracket,
  type ChallengeRoundEvaluationItem,
  type ChallengeRoundSessionState,
  type ConversationLanguage,
} from '@eduagent/schemas';
import {
  buildExchangeSourceEvidence,
  buildSystemPrompt,
  sanitizeUserContent,
  type ExchangeContext,
} from '../../src/services/exchanges';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import { buildChallengeRoundGraderPrompt } from '../../src/services/challenge-round/grader-prompt';
import { MAX_CHALLENGE_QUESTIONS } from '../../src/services/challenge-round/caps';
import {
  decideMasteryAndReview,
  type MasteryDecision,
} from '../../src/services/challenge-round/evaluation';
import { transitionChallengeState } from '../../src/services/challenge-round/state';
import { parseEnvelope } from '../../src/services/llm/envelope';
import { extractFirstJsonObject } from '../../src/services/llm';
import {
  getModelConfigForTest,
  withSafetyPreamble,
} from '../../src/services/llm/router';
import type { ChatMessage } from '../../src/services/llm/types';
import type {
  ChallengeSimScenario,
  QuestionAssessment,
} from '../fixtures/challenge-personas';
import type { EvalProfile } from '../fixtures/profiles';
import { runHarnessLlm } from './llm-client';
import { callOpenRouterModel } from './llm-bootstrap';
import {
  runLearnerTurn,
  type LearnerHistoryEntry,
  type LearnerTurnArgs,
} from './learner-agent';

// ---------------------------------------------------------------------------
// Simulated Challenge-Round driver — PRODUCTION GRADER-ON path.
//
// Drives a non-scripted, multi-turn round. One LLM plays the learner (pinned
// OpenRouter slug, hidden competence brief). Each learner answer is then:
//   1. GRADED by the production judge (`buildChallengeRoundGraderPrompt` →
//      rung 1, capability:'judge') — the component production actually runs when
//      CHALLENGE_ROUND_GRADER_ENABLED is on (the default). This is the MEASURED
//      component: its emission rate is the RR-12 gpt-oss-drop indicator, and its
//      verdicts feed the mastery gate.
//   2. answered by the TUTOR (`buildSystemPrompt` with graderEnabled:true →
//      pinned to MENTOR_MODEL (gpt-oss) via OpenRouter) which just produces the
//      next question. The tutor is NOT the candidate under test and is NEVER
//      routed to the grader candidate.
//
// Why grader-ON, not the legacy inline-tutor signal: with the grader flag on,
// the tutor emits NO `challenge_round_evaluation` — a separate judge call owns
// it (`session/session-exchange.ts` → `runChallengeRoundGrader`,
// `exchange-prompts.ts` gates the inline field on `!graderEnabled`). Measuring
// the tutor envelope (as v1 did) describes a path prod has disabled by default;
// the gpt-oss signal-drop was the very reason the judge was introduced. See the
// 2026-06-27 post-review corrections in the plan.
//
// The pure state machine (`transitionChallengeState`) and pure mastery gate
// (`decideMasteryAndReview`) run in-memory, DB-free. The gate's outcome is
// compared to the scenario's ground-truth `expectedOutcome` to make over-/
// under-credit measurable.
//
// DB-free by design: the production-only `validateEvaluationEventIds` (a strict
// DB lookup that REJECTS the whole evaluation on any unresolved answerEventId,
// → outcome 'invalid' in prod) is intentionally NOT called — there is no seeded
// DB. Direction of the bias: because the harness skips that rejection, its
// `verified` / over-credit rate is an UPPER BOUND on production's — production
// can only be ≤ the harness here. The simulator measures the LLM contract + the
// mastery decision, not the DB-anchoring step.
// ---------------------------------------------------------------------------

/** The tutor turn runs at rung 3, mirroring flows/challenge-round-mastery.ts. */
const TUTOR_RUNG = 3 as const;

/**
 * The conversation-driver tutor model. Pinned to the production gpt-oss host
 * model (the V2 under-18 mentor of record — docs/registers/llm-models/master.md)
 * and reached via the OpenRouter candidate path (`callOpenRouterModel`), NOT
 * production routing: the harness router only registers gemini/openai/anthropic
 * configs (runner/llm-bootstrap.ts), and under the stg flag state
 * (LLM_ROUTING_V2 off, GEMINI_API_KEY present) `routeAndCall` would resolve a
 * minor's tutor to Gemini — never gpt-oss. Pinning the slug makes the driver
 * faithful to the V2 cutover target. The tutor is NOT the measured component
 * (the grader is), so OpenRouter-served gpt-oss is REPRESENTATIVE, not bit-exact
 * to the Cerebras production host; pin a host with `--provider` for sensitivity.
 * Must stay in lockstep with the seed run + weekly gate (both pin this same
 * model) — `mentorModel` in the baseline records it for provenance.
 */
export const MENTOR_MODEL = 'openai/gpt-oss-120b';

/** The grader judge runs at rung 1 — same as GRADER_RUNG in challenge-round/grader.ts. */
const GRADER_RUNG = 1 as const;

/**
 * The tier the turns route at. Must stay in lockstep with `buildMentorContext`'s
 * `llmTier` so the production-routing guard (`resolveProductionGraderModel`)
 * resolves the exact judge model the grading turn will use.
 */
const TURN_LLM_TIER = 'standard' as const;
/** Matches production's recent conversation source-evidence window. */
const MAX_HISTORY_TURNS = 6;

/** Fallback next-question if a tutor turn fails to parse. It is marked degraded
 *  in simulator-only diagnostics so it can never be mistaken for tutor output. */
const FALLBACK_FOLLOWUP =
  'Can you explain a bit more about why that is — what makes it work?';

export type TutorTurn =
  | { source: 'model'; question: string; assessment?: QuestionAssessment }
  | {
      source: 'degraded';
      question: string;
      failure: 'envelope_parse';
      /** Simulator diagnostic only; never used by production or user-facing paths. */
      rawOutput: string;
      assessment?: QuestionAssessment;
    };

export interface QuestionDiagnostic {
  source: 'seed' | TutorTurn['source'];
  question: string;
  /** Exact or fixture-declared semantic repetition under the operator contract. */
  repeatsPriorQuestion: boolean;
  failure?: 'envelope_parse';
  /** Simulator diagnostic only; retained for failed tutor-envelope investigation. */
  rawOutput?: string;
  assessment?: QuestionAssessment;
}

export interface SimulatedRoundResult {
  scenarioId: string;
  profileId: string;
  /** 'production-routing' or the explicit grader-candidate slug under test. */
  graderModel: string;
  learnerModel: string;
  transcript: Array<{ role: 'assistant' | 'user'; content: string }>;
  /** Generated tutor questions only, with provenance and parse diagnostics. */
  tutorTurns: TutorTurn[];
  /** Seed + generated questions, measured against prior lesson and round questions. */
  questionDiagnostics: QuestionDiagnostic[];
  /** Scenario-owned semantic aliases; never inferred from model prose. */
  conceptEquivalenceKeys: Record<string, string>;
  /** Accumulated across all answered turns (from the production judge). */
  evaluations: ChallengeRoundEvaluationItem[];
  decision: MasteryDecision;
  expectedOutcome: ChallengeSimScenario['expectedOutcome'];
  /** false if any active turn's GRADER returned 0 valid items (the gpt-oss drop). */
  signalEmitted: boolean;
}

export interface RunSimulatedRoundArgs {
  scenario: ChallengeSimScenario;
  profile: EvalProfile;
  /** Pinned learner OpenRouter slug. */
  learnerModel: string;
  /**
   * The GRADER candidate under test: null = production routing (judge via
   * routeAndCall); a slug = explicit candidate routed via the runHarnessLlm
   * OpenRouter override (`--grader-model`).
   */
  graderModel: string | null;
  /** Override the heuristic same-base-family guard for a deliberate A/B. */
  allowSameFamily?: boolean;
}

export interface GraderTurnArgs {
  askedQuestion: string;
  learnerAnswer: string;
  answerEventId: string;
  ageBracket: AgeBracket;
  conversationLanguage: ConversationLanguage;
}

/**
 * Dependency-injection seam for tests: replace the LLM boundaries directly (no
 * internal jest.mock — GC1-clean). Defaults wire the real implementations.
 */
export interface SimulatedRoundOverrides {
  learnerTurn?: (args: LearnerTurnArgs) => Promise<string>;
  /** Returns a provenance-labelled tutor turn. A string remains supported for existing test seams. */
  tutorTurn?: (
    ctx: ExchangeContext,
    learnerAnswer: string,
  ) => Promise<TutorTurn | string>;
  /** Returns the production judge's evaluation items ([] on any drop/parse-fail). */
  graderTurn?: (
    args: GraderTurnArgs,
  ) => Promise<ChallengeRoundEvaluationItem[]>;
}

/**
 * Stable v4-format UUID derived from a seed — answerEventId / topicId both
 * require `.uuid()`, and determinism keeps transcripts addressable + re-runnable.
 * NOTE: this is a hand-rolled SHA-1 → v4-shaped formatter (a deterministic
 * digest reshaped to satisfy `.uuid()`), NOT an RFC-4122 v5 namespaced UUID.
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
 * Coarser vendor/base root (first family token) — `deepseek-chat` and
 * `deepseek-r1` both → `deepseek`; `gpt-oss` and `gpt-4o` both → `gpt`. Used for
 * a SOFT same-lineage warning the two-token family check misses (it leaks toward
 * letting correlated pairs run, not toward false alarms).
 */
export function vendorRoot(slug: string): string {
  return modelFamily(slug).split('-')[0] ?? '';
}

/**
 * Two-model guard: refuse to run when the learner and GRADER are the same model
 * (or share a base family, heuristically) — correlated errors would inflate the
 * `solid` rate and yield a falsely lenient bar. Note the axis: the correlation
 * that matters is learner-vs-grader (the model answering vs the model judging),
 * NOT learner-vs-tutor.
 */
export function assertTwoModelGuard(
  learnerModel: string,
  graderModel: string,
  allowSameFamily: boolean,
): void {
  if (learnerModel === graderModel) {
    throw new Error(
      `two-model guard: learner and grader are the same model (${learnerModel}). ` +
        'The grader must differ from the learner or correlated errors inflate the solid rate.',
    );
  }
  if (!allowSameFamily) {
    const lf = modelFamily(learnerModel);
    const mf = modelFamily(graderModel);
    if (lf.length > 0 && lf === mf) {
      throw new Error(
        `two-model guard (heuristic): learner (${learnerModel}) and grader (${graderModel}) ` +
          `share base family "${lf}". This is a heuristic slug/family check; pass ` +
          'allowSameFamily / --allow-same-family for a deliberate same-family A/B.',
      );
    }
    // Family differs (we did not throw) but vendor roots match → possible
    // same-lineage correlation the two-token family check cannot catch
    // (e.g. deepseek-chat vs deepseek-r1). Warn, do NOT block — blocking would
    // false-positive on genuinely distinct same-vendor models (gpt-4o vs gpt-oss).
    const lr = vendorRoot(learnerModel);
    const mr = vendorRoot(graderModel);
    if (lr.length > 0 && lr === mr) {
      console.warn(
        `[two-model guard] learner (${learnerModel}) and grader (${graderModel}) share vendor ` +
          `root "${lr}" but differ at the family level — possible same-lineage correlation the ` +
          'family heuristic cannot catch. Proceeding; confirm these are genuinely distinct models.',
      );
    }
  }
}

/**
 * Resolve the concrete model the production router would use for the GRADER
 * (the judge, rung 1, capability:'judge') for THIS profile. Age-dependent on
 * purpose: minors short-circuit to the approved non-Gemini fallback BEFORE the
 * judge branch (`router.ts` under-18 gate), and every sim scenario is a minor,
 * so resolving WITHOUT the age bracket would validate the guard against the
 * wrong model and let learner == real-grader slip through. Mirror the grader
 * call's routing inputs exactly: rung 1, capability 'judge', tier 'standard'
 * (the grader passes no llmTier → default standard), and the profile's bracket.
 */
export function resolveProductionGraderModel(profile: EvalProfile): string {
  return getModelConfigForTest(GRADER_RUNG, {
    llmTier: TURN_LLM_TIER,
    capability: 'judge',
    ageBracket: resolveAgeBracket(profile.birthYear),
  }).model;
}

/**
 * Profile-independent judge-slug probe for the `--validate-baseline` drift
 * check (which runs with no profile loaded). Every challenge-sim scenario is a
 * MINOR, and all minor brackets resolve through the same under-18 gate to the
 * same non-Gemini judge-of-record, so a fixed `'adolescent'` bracket yields the
 * slug the baseline was seeded with. (Do not use for an adult-inclusive grid.)
 */
export function resolveJudgeSlugProbe(): string {
  return getModelConfigForTest(GRADER_RUNG, {
    llmTier: TURN_LLM_TIER,
    capability: 'judge',
    ageBracket: 'adolescent',
  }).model;
}

function toExchangeHistory(
  transcript: Array<{ role: 'assistant' | 'user'; content: string }>,
): ExchangeContext['exchangeHistory'] {
  return transcript.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    role: turn.role,
    content:
      turn.role === 'user' ? sanitizeUserContent(turn.content) : turn.content,
  }));
}

function buildMentorContext(params: {
  scenario: ChallengeSimScenario;
  profile: EvalProfile;
  conversationLanguage: ConversationLanguage;
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
    escalationRung: TUTOR_RUNG,
    exchangeHistory: params.exchangeHistory,
    birthYear: params.profile.birthYear,
    exchangeCount: 6,
    inputMode: 'text',
    llmTier: TURN_LLM_TIER,
    conversationLanguage: params.conversationLanguage,
    challengeRuntimeEnabled: true,
    // grader-ON: the tutor must NOT be asked to emit the inline eval — the
    // separate judge owns it. This mirrors production's default flag state.
    graderEnabled: true,
    challengeRound: params.challengeRound,
    currentUserMessageEventId: params.currentEventId,
  };
}

/**
 * Tutor turn — produces the next question. Pinned to MENTOR_MODEL (the
 * production gpt-oss host model) via the OpenRouter candidate path so the
 * conversation driver is faithful to the V2 cutover target, NOT to whatever the
 * harness router would resolve under the current flag state (Gemini/gpt-4o under
 * stg — see MENTOR_MODEL). It is never the grader candidate, so a
 * `--grader-model` candidate cannot contaminate the driver. Not the measured
 * component. The production safety + personalization preamble is replicated here
 * (`withSafetyPreamble`, which `routeAndCall` would otherwise prepend) so the
 * pinned model sees the same prompt production's tutor would.
 */
async function defaultTutorTurn(
  ctx: ExchangeContext,
  learnerAnswer: string,
): Promise<TutorTurn> {
  const sourceEvidence = buildExchangeSourceEvidence(ctx, learnerAnswer);
  const system = buildSystemPrompt({ ...ctx, sourceEvidence });
  const messages = withSafetyPreamble(
    [
      { role: 'system', content: system },
      { role: 'user', content: learnerAnswer },
    ] satisfies ChatMessage[],
    resolveAgeBracket(ctx.birthYear),
    { conversationLanguage: ctx.conversationLanguage },
  );
  const raw = await callOpenRouterModel(messages, MENTOR_MODEL, {
    responseFormat: 'json',
    reasoningEffort: 'low',
  });
  const parsed = parseEnvelope(raw, 'exchange.session');
  return parsed.ok
    ? { source: 'model', question: parsed.envelope.reply }
    : {
        source: 'degraded',
        question: FALLBACK_FOLLOWUP,
        failure: 'envelope_parse',
        rawOutput: raw,
      };
}

function normalizeQuestion(question: string): string {
  return question
    .trim()
    .toLowerCase()
    .replace(/[?!.,;:]+$/g, '')
    .replace(/\s+/g, ' ');
}

interface AssessedQuestion {
  question: string;
  assessment?: QuestionAssessment;
}

function hasQuestionRepeat(
  question: string,
  assessment: QuestionAssessment | undefined,
  priorQuestions: AssessedQuestion[],
): boolean {
  const normalized = normalizeQuestion(question);
  return priorQuestions.some((prior) => {
    if (normalizeQuestion(prior.question) === normalized) return true;
    if (!assessment || !prior.assessment) return false;
    return (
      normalizeQuestion(assessment.minimalLearningClaim) ===
        normalizeQuestion(prior.assessment.minimalLearningClaim) &&
      assessment.cognitiveOperation === prior.assessment.cognitiveOperation &&
      normalizeQuestion(assessment.materialContext) ===
        normalizeQuestion(prior.assessment.materialContext)
    );
  });
}

function normalizeTutorTurn(turn: TutorTurn | string): TutorTurn {
  return typeof turn === 'string' ? { source: 'model', question: turn } : turn;
}

/**
 * Pure parse seam mirroring `runChallengeRoundGrader`'s contract: extract first
 * JSON object → `JSON.parse` → `challengeRoundGraderVerdictSchema` → inject the
 * server-owned `answerEventId`. Any failure (no JSON / parse error / schema
 * invalid / `items:[]`) returns `[]` — a dropped signal, exactly as production
 * fails open. Exported so the failure paths are unit-tested directly (the live
 * `defaultGraderTurn` can't call `runChallengeRoundGrader`, which uses
 * `routeAndCall` and would ignore the `--grader-model` override) — this is the
 * drift guard against `grader.ts`'s parse contract.
 */
export function parseGraderResponse(
  raw: string,
  answerEventId: string,
): ChallengeRoundEvaluationItem[] {
  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const verdict = challengeRoundGraderVerdictSchema.safeParse(parsed);
  if (!verdict.success) return [];
  // Inject the server-owned answerEventId (the model never supplies it) —
  // mirrors runChallengeRoundGrader's server-ownership invariant.
  return verdict.data.items.map((item) => ({
    ...item,
    answerEventId,
  }));
}

/**
 * Grader turn — the MEASURED production component. Builds the real judge rubric
 * (`buildChallengeRoundGraderPrompt`) and routes via `runHarnessLlm` so a
 * `--grader-model` candidate is selected (override branch), or production judge
 * routing applies (capability:'judge', rung 1) when null. Mirrors the production
 * `runChallengeRoundGrader` parse contract: extract → JSON.parse → schema. Any
 * failure (no JSON / parse error / schema invalid / items:[]) returns [] — a
 * dropped signal, exactly as production fails open.
 */
async function defaultGraderTurn(
  args: GraderTurnArgs,
): Promise<ChallengeRoundEvaluationItem[]> {
  const messages = buildChallengeRoundGraderPrompt({
    askedQuestion: args.askedQuestion,
    learnerAnswer: args.learnerAnswer,
    ageBracket: args.ageBracket,
    conversationLanguage: args.conversationLanguage,
  });
  const raw = await runHarnessLlm(messages, GRADER_RUNG, {
    capability: 'judge',
    // WI-2624: mirrors runChallengeRoundGrader's own declaration — see that
    // call site's comment for why this is 'not-applicable' rather than
    // 'model-output' (no producer vendor is cleanly threadable here today).
    judgeIndependence: { mode: 'not-applicable' },
    responseFormat: 'json',
    ageBracket: args.ageBracket,
    conversationLanguage: args.conversationLanguage,
    sessionId: 'eval-sim-grader',
  });

  return parseGraderResponse(raw, args.answerEventId);
}

export async function runSimulatedRound(
  args: RunSimulatedRoundArgs,
  overrides: SimulatedRoundOverrides = {},
): Promise<SimulatedRoundResult> {
  const { scenario, profile, learnerModel, allowSameFamily = false } = args;

  // Two-model guard FIRST — before any LLM call. The null (production-routing)
  // case resolves the concrete JUDGE slug and applies the same check, so the
  // guard protects the correct axis (learner vs the model that actually grades).
  const graderModelLabel = args.graderModel ?? 'production-routing';
  const graderGuardSlug =
    args.graderModel ?? resolveProductionGraderModel(profile);
  assertTwoModelGuard(learnerModel, graderGuardSlug, allowSameFamily);

  const learnerTurn = overrides.learnerTurn ?? runLearnerTurn;
  const tutorTurn = overrides.tutorTurn ?? defaultTutorTurn;
  const graderTurn = overrides.graderTurn ?? defaultGraderTurn;

  const ageBracket = resolveAgeBracket(profile.birthYear);
  const conversationLanguage = conversationLanguageSchema.parse(
    profile.conversationLanguage,
  );

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
    ...(scenario.precedingLessonHistory ?? []),
  ];
  const priorLessonQuestions = (scenario.precedingLessonHistory ?? [])
    .filter((turn) => turn.role === 'assistant')
    .map((turn) => ({ question: turn.content, assessment: turn.assessment }));
  const questionDiagnostics: QuestionDiagnostic[] = [
    {
      source: 'seed',
      question: scenario.seedQuestion,
      assessment: scenario.seedQuestionAssessment,
      repeatsPriorQuestion: hasQuestionRepeat(
        scenario.seedQuestion,
        scenario.seedQuestionAssessment,
        priorLessonQuestions,
      ),
    },
  ];
  const askedQuestions: AssessedQuestion[] = [
    ...priorLessonQuestions,
    {
      question: scenario.seedQuestion,
      assessment: scenario.seedQuestionAssessment,
    },
  ];
  transcript.push({ role: 'assistant', content: scenario.seedQuestion });
  const learnerHistory: LearnerHistoryEntry[] = [];
  const allEvals: ChallengeRoundEvaluationItem[] = [];
  const tutorTurns: TutorTurn[] = [];

  let mentorQuestion = scenario.seedQuestion;
  let signalEmitted = true;
  let turnIndex = 0;

  while (state?.state === 'active' && turnIndex < MAX_CHALLENGE_QUESTIONS) {
    // 1. Learner answers the CURRENT question (history excludes this turn).
    const learnerAnswer = await learnerTurn({
      scenario,
      profile,
      mentorQuestion,
      history: [...learnerHistory],
      learnerModel,
    });
    transcript.push({ role: 'user', content: learnerAnswer });
    learnerHistory.push({ role: 'mentor', content: mentorQuestion });
    learnerHistory.push({ role: 'learner', content: learnerAnswer });

    const answerEventId = deterministicUuid(`${scenario.id}:q${turnIndex}`);

    // 2. GRADE the answer with the production judge (the MEASURED component).
    //    askedQuestion = the question just answered (clean prose), mirroring
    //    production's last-assistant-turn sourcing.
    const items = await graderTurn({
      askedQuestion: mentorQuestion,
      learnerAnswer,
      answerEventId,
      ageBracket,
      conversationLanguage,
    });
    if (items.length === 0) signalEmitted = false;
    allEvals.push(...items);

    // 3. Advance the state machine with the (possibly empty) evaluation.
    state = transitionChallengeState(state, {
      type: 'answer_complete',
      evaluation: items,
    });
    turnIndex += 1;

    // 4. TUTOR produces the next question — only while the round continues.
    //    Pinned to gpt-oss (MENTOR_MODEL); failure to parse falls back so the
    //    loop is never stranded (does NOT affect signalEmitted — not the signal).
    if (state?.state === 'active' && turnIndex < MAX_CHALLENGE_QUESTIONS) {
      const ctx = buildMentorContext({
        scenario,
        profile,
        conversationLanguage,
        challengeRound: state,
        exchangeHistory: toExchangeHistory(transcript),
        currentEventId: deterministicUuid(`${scenario.id}:tutor-q${turnIndex}`),
      });
      const nextTurn = normalizeTutorTurn(await tutorTurn(ctx, learnerAnswer));
      const repeatsPriorQuestion = hasQuestionRepeat(
        nextTurn.question,
        nextTurn.assessment,
        askedQuestions,
      );
      tutorTurns.push(nextTurn);
      questionDiagnostics.push({ ...nextTurn, repeatsPriorQuestion });
      askedQuestions.push({
        question: nextTurn.question,
        assessment: nextTurn.assessment,
      });
      mentorQuestion = nextTurn.question;
      transcript.push({ role: 'assistant', content: nextTurn.question });
    }
  }

  // Drive to completion from drafting (normal) or active (early break / cap).
  if (state && (state.state === 'drafting' || state.state === 'active')) {
    state = transitionChallengeState(state, { type: 'complete' });
  }

  const decision = decideMasteryAndReview(allEvals);

  return {
    scenarioId: scenario.id,
    profileId: profile.id,
    graderModel: graderModelLabel,
    learnerModel,
    transcript,
    tutorTurns,
    questionDiagnostics,
    conceptEquivalenceKeys: scenario.conceptEquivalenceKeys ?? {},
    evaluations: allEvals,
    decision,
    expectedOutcome: scenario.expectedOutcome,
    signalEmitted,
  };
}
