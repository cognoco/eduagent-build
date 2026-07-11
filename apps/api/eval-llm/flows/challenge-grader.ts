// ---------------------------------------------------------------------------
// Flow adapter — Challenge Round grader bake-off (T10, plan 2026-06-26)
//
// PURPOSE
// -------
// This flow implements the model-selection gate for the Challenge Round grader
// (plan task T10). The grader is a dedicated judge that reads (a) the mentor's
// question and (b) the learner's verbatim answer and emits a structured
// `challengeRoundGraderVerdictSchema` object. The production service
// (`runChallengeRoundGrader`, T5) injects `answerEventId` server-side after
// parsing — the model only produces judgment fields.
//
// WHY A SEPARATE FLOW (not an extension of challenge-round-mastery)
// ----------------------------------------------------------------
// `challenge-round-mastery` tests whether the TUTOR (gpt-oss / Gemini) emits
// `signals.challenge_round_evaluation` inline in the exchange envelope — the
// blocker being that gpt-oss silently drops it. This flow tests whether a
// DEDICATED GRADER correctly grades learner answers in isolation, without the
// full exchange context crowding out the output. The grader receives only the
// question + answer and must return `{ items: [{...}] }` — nothing else.
//
// TWO-AXIS QUALITY GATE
// ---------------------
// Both axes must pass for a candidate to be adopted. A single failure on
// either axis disqualifies the candidate.
//
//   FORMAT AXIS — every fixture must produce a non-empty, schema-valid verdict.
//     · `items` array must have length >= 1 (`.min(1)` in the schema).
//     · `items[*].result` must be one of: solid | partial | missing | misconception.
//     · A single empty/invalid/non-JSON response FAILS the candidate — this is
//       the exact gpt-oss failure mode the plan exists to eliminate.
//
//   JUDGMENT AXIS — fixtures carry a known-good label.
//     · CGR01-solid        : clearly correct answer → must grade `solid`.
//     · CGR02-misconception: confident but wrong     → must grade `misconception`
//                            (NOT `solid`).
//     · CGR03-missing      : non-answer              → must grade `missing`
//                            (NOT `solid`).
//     · CGR04-shaky-not-solid: overconfident, factually wrong → must NOT grade
//                            `solid`. This is the FALSE-MASTERY INVERSE GUARD:
//                            a grader that rubber-stamps over-confident errors
//                            defeats the conservative mastery gate in T7/T9.
//     · CGR05-partial      : incomplete answer       → must NOT grade `solid`
//                            (over-generous grading would grant false mastery).
//
// BAKE-OFF PROTOCOL
// -----------------
// The harness swaps models via the global `--openrouter-model <slug>` CLI
// override (routes ALL live calls through the eval-only OpenRouter adapter).
// Run this flow IN ISOLATION (`--flow challenge-grader`) once per candidate.
// OpenRouter slugs differ from production model IDs.
//
// Candidate → OpenRouter slug mapping:
//   Sonnet 4.6 (default, stronger):  anthropic/claude-sonnet-4-6
//   Haiku 4.5  (demotion candidate): anthropic/claude-haiku-4-5
//   GPT-5-mini (optional):           openai/gpt-5-mini
//
// BAKE-OFF COMMANDS (run one per candidate — needs Doppler stg + OPENROUTER_API_KEY):
//
//   # Candidate 1 — Sonnet 4.6 (start here; it is the production default in T3)
//   doppler run -c stg -- pnpm eval:llm -- --flow challenge-grader --live \
//     --openrouter-model anthropic/claude-sonnet-4-6
//
//   # Candidate 2 — Haiku 4.5 (demote only if this run is fully clean)
//   doppler run -c stg -- pnpm eval:llm -- --flow challenge-grader --live \
//     --openrouter-model anthropic/claude-haiku-4-5
//
//   # Candidate 3 — GPT-5-mini (optional)
//   doppler run -c stg -- pnpm eval:llm -- --flow challenge-grader --live \
//     --openrouter-model openai/gpt-5-mini
//
// After each run: restore snapshots before committing:
//   git checkout -- apps/api/eval-llm/snapshots
//
// RECORDING THE WINNER
// --------------------
// 1. A candidate PASSES when:
//    - quality_failures == 0 (zero errors in BOTH axes across ALL fixtures), AND
//    - every fixture produced items.length >= 1 (format axis), AND
//    - every judgment-axis assertion passed (no over-crediting, labels matched).
//
// 2. If multiple candidates pass, pick the cheapest (Haiku before Sonnet).
//    If only Sonnet passes, keep Sonnet as GRADER_MODEL (T3 default).
//
// 3. Record the winner in a new `vetting/` entry in the master register
//    (`docs/registers/llm-models/master.md`), following the existing vetting
//    entry format. The entry must include:
//    - Task reference: T10 (plan 2026-06-26-challenge-round-grader-judge.md)
//    - Role: challenge-round grader (judge capability, non-reasoning)
//    - Candidate models tested + their pass/fail on both axes
//    - Winning model + slug
//    - Date of bake-off run
//    - Command used (copy from above)
//
// 4. Update GRADER_MODEL in `apps/api/src/services/llm/router.ts` (T3) to
//    the winner's production ID (e.g. 'claude-haiku-4-5' if Haiku passes).
//    IMPORTANT: GRADER_MODEL uses the production ID ('claude-sonnet-4-6'),
//    NOT the OpenRouter slug ('anthropic/claude-sonnet-4-6') — they differ.
//
// 5. NO grader model is trusted in production until this bake-off passes.
//    The CHALLENGE_ROUND_GRADER_ENABLED flag stays off until T10 is complete.
//
// NOTE: This task's CODE deliverable (the flow + fixtures + scoring) is
// separate from the LIVE bake-off run (gated on Doppler stg access +
// OPENROUTER_API_KEY + cost approval). The actual winner decision and
// GRADER_MODEL update are a gated follow-up after a human reviews the run.
// ---------------------------------------------------------------------------

import type { AgeBracket, ConversationLanguage } from '@eduagent/schemas';
import { challengeRoundGraderVerdictSchema } from '@eduagent/schemas';
import { buildChallengeRoundGraderPrompt } from '../../src/services/challenge-round/grader-prompt';
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
// Types
// ---------------------------------------------------------------------------

/**
 * Expected grader output for each fixture:
 * - `solid`         — the model MUST grade it solid (correct answer).
 * - `not-solid`     — the model MUST NOT grade it solid (shaky/wrong/incomplete).
 * - `misconception` — the model must grade it misconception AND must NOT grade solid.
 * - `missing`       — the model must grade it missing AND must NOT grade solid.
 */
type ExpectedGraderResult = 'solid' | 'not-solid' | 'misconception' | 'missing';

interface GraderSpec {
  /** Stable kebab-case id included in the snapshot filename. */
  id: string;
  /** Profile this scenario runs against (determines ageBracket + language). */
  profileId: string;
  /** Human-readable one-liner for snapshot notes. */
  description: string;
  /** The mentor's question (grading context for the model). */
  askedQuestion: string;
  /** The learner's verbatim answer under evaluation. */
  learnerAnswer: string;
  /** Which axis(es) this fixture guards and what the expected verdict is. */
  expectedResult: ExpectedGraderResult;
  /** Short note that appears in snapshot and explains the axis being tested. */
  axisNote: string;
}

export interface ChallengeGraderInput {
  scenarioId: string;
  description: string;
  askedQuestion: string;
  learnerAnswer: string;
  expectedResult: ExpectedGraderResult;
  axisNote: string;
  ageBracket: AgeBracket;
  conversationLanguage: ConversationLanguage;
}

// ---------------------------------------------------------------------------
// Fixture battery
// ---------------------------------------------------------------------------

const GRADER_SCENARIOS: GraderSpec[] = [
  {
    id: 'CGR01-solid',
    profileId: '15yo-football-gaming',
    description:
      'Correct mechanism answer for reaction kinetics — must grade solid.',
    askedQuestion:
      'Why does increasing temperature speed up a chemical reaction?',
    learnerAnswer:
      'Because the molecules move faster when it is hotter, so they collide more often and with more energy. More energetic collisions means a higher chance the reaction will actually happen.',
    expectedResult: 'solid',
    axisNote:
      'Format axis: response must be non-empty schema-valid JSON. ' +
      'Judgment axis: correct answer citing collision frequency + energy must grade solid.',
  },
  {
    id: 'CGR02-misconception',
    profileId: '12yo-dinosaurs',
    description:
      'Confident but factually wrong answer about why the Moon has equal fall-time — must grade misconception, NOT solid.',
    askedQuestion:
      'On the Moon, why do a hammer and a feather land at exactly the same moment when dropped from the same height?',
    learnerAnswer:
      "Because the Moon's gravity is so weak it cannot pull heavy things harder than light things. When gravity is weak enough, it just pulls everything at the same gentle rate — heavy or light does not matter anymore.",
    expectedResult: 'misconception',
    axisNote:
      'Format axis: response must be non-empty schema-valid JSON. ' +
      'Judgment axis: the answer attributes equal fall-time to weak gravity rather than absence of air ' +
      'resistance — a clear misconception. Must grade misconception, must NOT grade solid.',
  },
  {
    id: 'CGR03-missing',
    profileId: '13yo-spanish-beginner',
    description: 'Complete non-answer — must grade missing, NOT solid.',
    askedQuestion:
      'Why did the French Third Estate revolt against the king in 1789?',
    learnerAnswer:
      "I haven't studied the French Revolution yet so I really don't know why it happened.",
    expectedResult: 'missing',
    axisNote:
      'Format axis: response must be non-empty schema-valid JSON (a non-answer by the LEARNER does not ' +
      'mean the GRADER returns empty items — it must still grade the attempt). ' +
      'Judgment axis: non-answer must grade missing, must NOT grade solid.',
  },
  {
    id: 'CGR04-shaky-not-solid',
    profileId: '12yo-dinosaurs',
    description:
      'Overconfident answer that sounds plausible but asserts the OPPOSITE of the correct conclusion — FALSE-MASTERY INVERSE GUARD. Must NOT grade solid.',
    askedQuestion:
      'Why do trained athletes have a lower resting heart rate than untrained people?',
    learnerAnswer:
      'Athletes exercise their hearts all the time, so the heart gets bigger and stronger. ' +
      'A stronger heart pumps faster and works harder, which is why athletes always have the ' +
      'highest heart rates even when resting. Coaches check resting heart rate because higher means fitter.',
    expectedResult: 'not-solid',
    axisNote:
      'Format axis: response must be non-empty schema-valid JSON. ' +
      'Judgment axis (FALSE-MASTERY GUARD): the answer confidently asserts athletes have HIGHER ' +
      'resting heart rates — the opposite of the correct answer (trained hearts pump MORE blood per ' +
      'beat, lowering resting rate). A grader that marks this solid would grant false mastery on bad ' +
      'evidence. Must NOT grade solid.',
  },
  {
    id: 'CGR05-partial',
    profileId: '15yo-football-gaming',
    description:
      'Incomplete answer that captures only part of the concept — must NOT grade solid (guards over-generous grading).',
    askedQuestion: 'What happens during photosynthesis?',
    learnerAnswer: 'Plants use sunlight to make food. They also take in water.',
    expectedResult: 'not-solid',
    axisNote:
      'Format axis: response must be non-empty schema-valid JSON. ' +
      'Judgment axis: incomplete answer (misses CO₂ input, O₂ output, chlorophyll role, ' +
      'glucose synthesis) must not grade solid — over-generous grading would grant mastery on a ' +
      'partial understanding.',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coarse age band from profile age, matching grader-prompt.ts semantics. */
function toAgeBracket(ageYears: number): AgeBracket {
  if (ageYears < 13) return 'child';
  if (ageYears < 18) return 'adolescent';
  return 'adult';
}

/** Tokenize to check learnerQuote grounding (mirrors challenge-round-mastery.ts). */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

// ---------------------------------------------------------------------------
// Quality evaluation — both axes
// ---------------------------------------------------------------------------

/**
 * Evaluate the grader's verdict against the fixture's expected result.
 * Exported for unit-testability.
 */
export function evaluateGraderVerdict(
  input: ChallengeGraderInput,
  liveResponse: string,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const id = input.scenarioId;

  // ── FORMAT AXIS ─────────────────────────────────────────────────────────
  // Step 1: Response must contain parseable JSON.
  const parsed = parseFirstJsonObject(liveResponse);
  if (!parsed) {
    issues.push(
      qualityError(
        `${id}.format.no-json`,
        'Response contains no parseable JSON object — format axis FAIL (exact gpt-oss failure mode).',
      ),
    );
    return issues; // can't proceed without JSON
  }

  // Step 2: JSON must match challengeRoundGraderVerdictSchema (items.length >= 1).
  const verdict = challengeRoundGraderVerdictSchema.safeParse(parsed);
  if (!verdict.success) {
    const paths = verdict.error.issues.map((i) => i.path.join('.')).join(', ');
    issues.push(
      qualityError(
        `${id}.format.schema-invalid`,
        `Response failed grader verdict schema: ${paths} — format axis FAIL. ` +
          'If items:[] was returned, this is the exact gpt-oss empty-array failure mode.',
      ),
    );
    return issues; // can't evaluate judgment without a valid schema
  }

  // items.length >= 1 is enforced by the schema (.min(1)), so if we reach
  // here the format axis has passed for this fixture.
  const items = verdict.data.items;

  // ── JUDGMENT AXIS ────────────────────────────────────────────────────────
  const results = items.map((item) => item.result);

  switch (input.expectedResult) {
    case 'solid':
      // Correct answer must be recognized.
      if (!results.some((r) => r === 'solid')) {
        issues.push(
          qualityError(
            `${id}.judgment.under-credited`,
            `Correct answer was not graded solid (got: ${results.join(', ')}) — over-conservative grader.`,
          ),
        );
      }
      break;

    case 'not-solid':
      // Shaky/incomplete answer must NOT be blessed as solid.
      if (results.some((r) => r === 'solid')) {
        issues.push(
          qualityError(
            `${id}.judgment.over-credited`,
            `Shaky or incomplete answer was graded solid — FALSE-MASTERY RISK. ` +
              'The conservative mastery gate (T7) would mark mastery on bad evidence.',
          ),
        );
      }
      break;

    case 'misconception':
      // Over-crediting a misconception is a hard error.
      if (results.some((r) => r === 'solid')) {
        issues.push(
          qualityError(
            `${id}.judgment.over-credited`,
            'Answer with planted misconception was graded solid — FALSE-MASTERY RISK.',
          ),
        );
      }
      // Not grading it as misconception is a softer concern (could be partial).
      if (!results.some((r) => r === 'misconception')) {
        issues.push(
          qualityWarning(
            `${id}.judgment.missed-misconception`,
            `Answer with planted misconception was not graded misconception (got: ${results.join(', ')}). ` +
              'Review whether the grader rubric is precise enough.',
          ),
        );
      }
      break;

    case 'missing':
      // Over-crediting a non-answer is a hard error.
      if (results.some((r) => r === 'solid')) {
        issues.push(
          qualityError(
            `${id}.judgment.over-credited`,
            'Non-answer was graded solid — FALSE-MASTERY RISK.',
          ),
        );
      }
      // Not grading it as missing is a softer concern.
      if (!results.some((r) => r === 'missing')) {
        issues.push(
          qualityWarning(
            `${id}.judgment.missed-missing`,
            `Non-answer was not graded missing (got: ${results.join(', ')}). ` +
              'Review whether the grader rubric handles empty/vague attempts.',
          ),
        );
      }
      break;
  }

  // ── GROUNDING CHECKS (soft) ──────────────────────────────────────────────
  // learnerQuote should overlap the actual answer (the server replaces it with
  // the verified event text, but zero overlap suggests the model fabricated).
  const answerTokens = new Set(tokenize(input.learnerAnswer));
  for (const item of items) {
    if (!item.learnerQuote) {
      issues.push(
        qualityWarning(
          `${id}.grounding.no-quote`,
          `Grader item for concept "${item.concept}" has an empty learnerQuote.`,
        ),
      );
    } else {
      const quoteOverlap = tokenize(item.learnerQuote).some((w) =>
        answerTokens.has(w),
      );
      if (!quoteOverlap) {
        issues.push(
          qualityWarning(
            `${id}.grounding.fabricated-quote`,
            `learnerQuote "${item.learnerQuote}" shares no tokens with the learner's answer — possible fabrication.`,
          ),
        );
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Flow definition
// ---------------------------------------------------------------------------

export const challengeGraderFlow: FlowDefinition<ChallengeGraderInput> = {
  id: 'challenge-grader',
  name: 'Challenge Round grader bake-off (model-selection gate)',
  sourceFile:
    'apps/api/src/services/challenge-round/grader-prompt.ts:buildChallengeRoundGraderPrompt',
  // NOT emitsEnvelope — the grader returns { items: [...] }, not the standard
  // { reply, signals, ui_hints } exchange envelope. Excluding it from the
  // aggregate signal-distribution baseline keeps baseline.json clean.
  expectedResponseSchema: challengeRoundGraderVerdictSchema,

  buildPromptInput(): ChallengeGraderInput | null {
    // Not used — enumerateScenarios fans out instead.
    return null;
  },

  enumerateScenarios(
    profile: EvalProfile,
  ): Array<Scenario<ChallengeGraderInput>> | null {
    const matching = GRADER_SCENARIOS.filter(
      (spec) => spec.profileId === profile.id,
    );
    if (matching.length === 0) return null;

    return matching.map((spec) => ({
      scenarioId: spec.id,
      input: {
        scenarioId: spec.id,
        description: spec.description,
        askedQuestion: spec.askedQuestion,
        learnerAnswer: spec.learnerAnswer,
        expectedResult: spec.expectedResult,
        axisNote: spec.axisNote,
        ageBracket: toAgeBracket(profile.ageYears),
        conversationLanguage:
          profile.conversationLanguage as ConversationLanguage,
      },
    }));
  },

  buildPrompt(input: ChallengeGraderInput): PromptMessages {
    const messages = buildChallengeRoundGraderPrompt({
      askedQuestion: input.askedQuestion,
      learnerAnswer: input.learnerAnswer,
      ageBracket: input.ageBracket,
      conversationLanguage: input.conversationLanguage,
    });
    // grader-prompt emits string content only; narrow the ChatMessage union
    // (string | MessagePart[]) to satisfy PromptMessages' string fields.
    const asText = (c: string | unknown[] | undefined): string =>
      typeof c === 'string' ? c : '';
    return {
      system: asText(messages[0]?.content),
      user: asText(messages[1]?.content),
      notes: [
        `Grader scenario: ${input.scenarioId} — ${input.description}`,
        `Expected result: ${input.expectedResult}`,
        `Axis note: ${input.axisNote}`,
        'FORMAT AXIS: response must be a JSON object matching challengeRoundGraderVerdictSchema with items.length >= 1.',
        'JUDGMENT AXIS: see expected result and axis note above.',
        'BAKE-OFF: run --flow challenge-grader --live --openrouter-model <slug> for each candidate.',
        'Candidates: anthropic/claude-sonnet-4-6 (default), anthropic/claude-haiku-4-5 (demotion candidate).',
        'After run: git checkout -- apps/api/eval-llm/snapshots',
      ],
    };
  },

  async runLive(
    input: ChallengeGraderInput,
    messages: PromptMessages,
  ): Promise<string> {
    return runHarnessLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      1, // rung 1 — same as GRADER_RUNG in production (cheap judge call, non-reasoning)
      {
        responseFormat: 'json',
        ageBracket: input.ageBracket,
        conversationLanguage: input.conversationLanguage,
        sessionId: 'eval-challenge-grader',
      },
    );
  },

  evaluateQuality({ input, liveResponse }): QualityIssue[] {
    return evaluateGraderVerdict(input, liveResponse);
  },
};
