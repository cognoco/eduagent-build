import {
  buildExchangeSourceEvidence,
  buildSystemPrompt,
  type ExchangeContext,
} from '../../src/services/exchanges';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import type { EvalProfile } from '../fixtures/profiles';
import type {
  FlowDefinition,
  PromptMessages,
  QualityIssue,
  Scenario,
} from '../runner/types';
import { runHarnessLlm } from '../runner/llm-client';
import { callLlm } from '../runner/llm-bootstrap';
import {
  parseFirstJsonObject,
  qualityError,
  qualityWarning,
} from '../runner/quality';

// ---------------------------------------------------------------------------
// Flow adapter — Misconception Repair (multi-turn, LLM-judged)
//
// Every other flow in the harness is single-turn: one prompt, one response,
// one check. But "does the app actually TEACH?" is a multi-turn question — it
// is about whether the mentor can move a learner from a wrong belief to a
// right one across a short dialogue. This flow is the harness's first
// multi-turn capability.
//
// Mechanism per scenario:
//   1. A simulated learner OPENS by stating a classic, well-documented
//      misconception (seasons caused by distance, multiplication always makes
//      bigger, heavier objects fall faster).
//   2. For up to MAX_MENTOR_TURNS rounds: the real production mentor prompt
//      (buildSystemPrompt) responds, then a simulated-learner LLM replies in
//      character — only abandoning the misconception if genuinely convinced.
//   3. An independent judge LLM reads the full transcript and rules whether
//      the misconception was REPAIRED, and whether the mentor ever REINFORCED
//      it or just handed over the answer without teaching.
//
// Model separation (mirrors language-quality.ts):
//   - The MENTOR goes through runHarnessLlm, so a --openrouter-model candidate
//     override applies — you can A/B a candidate model's teaching ability.
//   - The simulated LEARNER and the JUDGE go through callLlm (production
//     routing), which the candidate override deliberately does NOT touch — a
//     candidate can never play its own student or grade its own teaching.
//
// Judge/learner failures (timeout, unparseable) are WARNINGS, never errors —
// a flaky support model must not fail the teaching gate.
//
// Cost note: each scenario makes up to (MAX_MENTOR_TURNS mentor +
// MAX_MENTOR_TURNS-1 learner + 1 judge) live calls. With 3 scenarios that is
// ~18 calls. The runner's --max-live-calls counts runLive invocations (one per
// scenario), so budget for the multiplier when seeding.
// ---------------------------------------------------------------------------

const MAX_MENTOR_TURNS = 3;

interface DialogueTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface MisconceptionScenario {
  id: string;
  profileId: string;
  subjectName: string;
  topicTitle: string;
  /** Reliable source material giving the CORRECT explanation, so the mentor's
   *  source-grounding rules permit it to teach the correction. */
  topicDescription: string;
  /** The wrong belief, stated plainly for the judge and the simulated learner. */
  misconception: string;
  /** The learner's opening line embodying the misconception. */
  learnerOpening: string;
}

const MISCONCEPTION_SCENARIOS: MisconceptionScenario[] = [
  {
    id: 'MR01-seasons',
    profileId: '12yo-dinosaurs',
    subjectName: 'Science',
    topicTitle: 'Why we have seasons',
    topicDescription:
      "Seasons are caused by the tilt of Earth's axis, which changes how directly sunlight strikes a hemisphere. Earth's distance from the Sun barely changes over a year and is not the cause of the seasons.",
    misconception:
      'The learner believes summer is hot because the Earth is closer to the Sun (distance causes seasons), rather than axial tilt.',
    learnerOpening:
      "Summer is hot because the Earth gets closer to the Sun, right? That's why it warms up.",
  },
  {
    id: 'MR02-multiplication',
    profileId: '15yo-football-gaming',
    subjectName: 'Mathematics',
    topicTitle: 'What multiplication does to a number',
    topicDescription:
      'Multiplying by a number greater than 1 increases a value, multiplying by 1 keeps it the same, and multiplying by a number between 0 and 1 makes it smaller. So multiplication does not always make a number bigger.',
    misconception:
      'The learner believes multiplying always makes a number bigger, not realising multiplying by a value between 0 and 1 makes it smaller.',
    learnerOpening:
      "Multiplying always makes the number bigger — that's just how times works.",
  },
  {
    id: 'MR03-falling',
    profileId: '17yo-french-advanced',
    subjectName: 'Physics',
    topicTitle: 'How objects fall',
    topicDescription:
      'In the absence of air resistance, all objects fall at the same rate regardless of mass, because gravity accelerates every mass equally (a heavier object also needs more force to accelerate). Air resistance, not weight, is what makes a feather fall slower than a coin.',
    misconception:
      'The learner believes heavier objects fall faster than lighter ones because gravity "pulls harder" on them.',
    learnerOpening:
      'A heavier object falls faster than a light one because gravity pulls harder on it, right?',
  },
];

export interface MisconceptionRepairInput {
  scenarioId: string;
  misconception: string;
  topicTitle: string;
  learnerOpening: string;
  profileId: string;
  context: ExchangeContext;
  learnerAge: number;
}

function buildContext(
  profile: EvalProfile,
  scenario: MisconceptionScenario,
  history: DialogueTurn[],
): ExchangeContext {
  return {
    sessionId: `eval-mr-${scenario.id}`,
    profileId: `eval-profile-${profile.id}`,
    subjectName: scenario.subjectName,
    topicTitle: scenario.topicTitle,
    topicDescription: scenario.topicDescription,
    sessionType: 'learning',
    escalationRung: 2,
    exchangeHistory: history,
    birthYear: profile.birthYear,
    exchangeCount: history.length,
    inputMode: 'text',
    llmTier: 'standard',
    // Keep the dialogue in English so the shared judge/learner models stay
    // robust regardless of the profile's native locale.
    conversationLanguage: 'en',
  };
}

// ---------------------------------------------------------------------------
// Simulated learner
// ---------------------------------------------------------------------------

function learnerSystemPrompt(
  scenario: MisconceptionScenario,
  age: number,
): string {
  return (
    `You are role-playing a ${age}-year-old student in a tutoring chat. ` +
    `You currently believe this, and you are fairly sure of it: "${scenario.misconception}" ` +
    'Respond as the student in 1-2 short, natural sentences. Stay in character. ' +
    'Do NOT be a pushover: if the tutor is vague, hand-wavy, or just asserts the answer without explaining WHY, stay confused or restate your belief. ' +
    'Only change your mind if the tutor gives a clear, concrete explanation that genuinely addresses why your belief is wrong — and if you do, show your new understanding in your own words. ' +
    "Output ONLY the student's next message. No quotation marks, no narration, no labels."
  );
}

function renderDialogueForLearner(history: DialogueTurn[]): string {
  return history
    .map((t) => `${t.role === 'assistant' ? 'Tutor' : 'You'}: ${t.content}`)
    .join('\n');
}

async function simulateLearnerTurn(
  scenario: MisconceptionScenario,
  age: number,
  history: DialogueTurn[],
): Promise<string> {
  const raw = await callLlm(
    [
      { role: 'system', content: learnerSystemPrompt(scenario, age) },
      {
        role: 'user',
        content: `${renderDialogueForLearner(history)}\n\nWhat do you say next?`,
      },
    ],
    { flow: 'eval-sim-learner', rung: 2 },
  );
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Judge
// ---------------------------------------------------------------------------

export interface RepairVerdict {
  repaired?: unknown;
  reinforced_misconception?: unknown;
  gave_direct_answer_without_teaching?: unknown;
  evidence?: unknown;
}

function judgeSystemPrompt(): string {
  return (
    'You are evaluating whether a tutor REPAIRED a specific misconception over a short dialogue with a student. ' +
    'Judge ONLY the outcome and the tutor behaviour described below — not tone or length.\n' +
    'Definitions:\n' +
    '- repaired = "yes" if, by the end, the student clearly abandoned the misconception AND expressed correct understanding in their own words; ' +
    '"partial" if there was real progress but the student is still shaky or partly wrong; ' +
    '"no" if the student still holds the misconception at the end.\n' +
    '- reinforced_misconception = true if the tutor ever AFFIRMED or strengthened the wrong belief.\n' +
    '- gave_direct_answer_without_teaching = true if the tutor mostly just stated the correct fact without explaining the reasoning or checking the student understood.\n' +
    'Reply with ONLY a JSON object, no prose before or after:\n' +
    '{"repaired": "yes"|"partial"|"no", "reinforced_misconception": <bool>, "gave_direct_answer_without_teaching": <bool>, "evidence": "<one short sentence quoting the turning point or the failure>"}'
  );
}

function judgeUserPrompt(
  scenario: MisconceptionScenario,
  history: DialogueTurn[],
): string {
  return (
    `Misconception under test: ${scenario.misconception}\n` +
    `Correct understanding: ${scenario.topicDescription}\n\n` +
    `Transcript:\n${renderDialogueForLearner(history)}`
  );
}

async function judgeTranscript(
  scenario: MisconceptionScenario,
  history: DialogueTurn[],
): Promise<RepairVerdict | { error: string }> {
  let raw: string;
  try {
    raw = await callLlm(
      [
        { role: 'system', content: judgeSystemPrompt() },
        { role: 'user', content: judgeUserPrompt(scenario, history) },
      ],
      { flow: 'eval-misconception-judge', rung: 2, responseFormat: 'json' },
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  const verdict = parseFirstJsonObject<RepairVerdict>(raw);
  return verdict ?? { error: 'unparseable judge verdict' };
}

// ---------------------------------------------------------------------------
// Verdict → quality issues (exported for deterministic unit testing)
// ---------------------------------------------------------------------------

interface RunLiveResult {
  transcript?: DialogueTurn[];
  verdict?: RepairVerdict | { error: string };
}

export function evaluateMisconceptionVerdict(
  input: MisconceptionRepairInput,
  liveResponse: string,
): QualityIssue[] {
  const parsed = parseFirstJsonObject<RunLiveResult>(liveResponse);
  const verdict = parsed?.verdict;
  if (!verdict) {
    return [
      qualityWarning(
        `${input.scenarioId}.no-verdict`,
        'Run produced no judge verdict — rerun before drawing conclusions.',
      ),
    ];
  }
  if ('error' in verdict && verdict.error) {
    return [
      qualityWarning(
        `${input.scenarioId}.judge-unavailable`,
        `Judge did not return a usable verdict (${verdict.error}) — transcript NOT judged.`,
      ),
    ];
  }

  const v = verdict as RepairVerdict;
  const issues: QualityIssue[] = [];
  const evidence =
    typeof v.evidence === 'string' && v.evidence ? ` Judge: ${v.evidence}` : '';

  // Reinforcing the wrong belief is the worst outcome — actively miseducating.
  if (v.reinforced_misconception === true) {
    issues.push(
      qualityError(
        `${input.scenarioId}.reinforced`,
        `Mentor reinforced the misconception instead of correcting it.${evidence}`,
      ),
    );
  }

  if (v.repaired === 'no') {
    issues.push(
      qualityError(
        `${input.scenarioId}.not-repaired`,
        `Misconception was not repaired by the end of the dialogue.${evidence}`,
      ),
    );
  } else if (v.repaired === 'partial') {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.partial-repair`,
        `Only partial repair — learner still shaky on the concept.${evidence}`,
      ),
    );
  } else if (v.repaired !== 'yes') {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.repaired-unknown`,
        `Judge returned an unrecognised repaired value: ${String(v.repaired)}.`,
      ),
    );
  }

  if (v.gave_direct_answer_without_teaching === true) {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.told-not-taught`,
        `Mentor mostly stated the answer without teaching the reasoning.${evidence}`,
      ),
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Flow definition
// ---------------------------------------------------------------------------

interface MentorEnvelopeLike {
  reply?: unknown;
}

function getScenario(id: string): MisconceptionScenario | undefined {
  return MISCONCEPTION_SCENARIOS.find((s) => s.id === id);
}

export const misconceptionRepairFlow: FlowDefinition<MisconceptionRepairInput> =
  {
    id: 'misconception-repair',
    name: 'Misconception Repair (multi-turn, LLM-judged)',
    sourceFile: 'apps/api/src/services/exchanges.ts:buildSystemPrompt',

    buildPromptInput(): MisconceptionRepairInput | null {
      // Not used — enumerateScenarios fans out instead.
      return null;
    },

    enumerateScenarios(
      profile: EvalProfile,
    ): Array<Scenario<MisconceptionRepairInput>> | null {
      const scenarios: Array<Scenario<MisconceptionRepairInput>> = [];
      for (const spec of MISCONCEPTION_SCENARIOS) {
        if (spec.profileId !== profile.id) continue;
        scenarios.push({
          scenarioId: spec.id,
          input: {
            scenarioId: spec.id,
            misconception: spec.misconception,
            topicTitle: spec.topicTitle,
            learnerOpening: spec.learnerOpening,
            profileId: profile.id,
            context: buildContext(profile, spec, []),
            learnerAge: profile.ageYears,
          },
        });
      }
      return scenarios.length > 0 ? scenarios : null;
    },

    buildPrompt(input: MisconceptionRepairInput): PromptMessages {
      // Tier 1 renders the OPENING mentor turn — the system prompt the mentor
      // sees when first hit with the misconception. The multi-turn simulation
      // only runs under --live (runLive).
      const sourceEvidence = buildExchangeSourceEvidence(
        input.context,
        input.learnerOpening,
      );
      const system = buildSystemPrompt({
        ...input.context,
        sourceEvidence,
      });
      return {
        system,
        user: input.learnerOpening,
        notes: [
          `Misconception-repair scenario: ${input.scenarioId}`,
          `Misconception: ${input.misconception}`,
          `Tier 1 shows only the OPENING mentor turn. Tier 2 runs up to ${MAX_MENTOR_TURNS} mentor turns against a simulated learner, then an LLM judge rules whether the misconception was repaired.`,
          'Mentor uses production routing (candidate override applies); simulated learner + judge use independent production routing.',
        ],
      };
    },

    async runLive(
      input: MisconceptionRepairInput,
      _messages: PromptMessages,
    ): Promise<string> {
      const scenario = getScenario(input.scenarioId);
      if (!scenario) {
        return JSON.stringify({
          verdict: { error: `unknown scenario ${input.scenarioId}` },
        });
      }

      const history: DialogueTurn[] = [];
      let nextLearnerMessage = input.learnerOpening;

      for (let turn = 0; turn < MAX_MENTOR_TURNS; turn++) {
        // Mentor turn — production system prompt with the dialogue so far baked
        // into context.exchangeHistory; the new learner line is the user turn.
        // input.context already carries the profile-derived fields (built for
        // the opening turn with empty history); swap in the growing history.
        const context: ExchangeContext = {
          ...input.context,
          exchangeHistory: history,
          exchangeCount: history.length,
        };
        const sourceEvidence = buildExchangeSourceEvidence(
          context,
          nextLearnerMessage,
        );
        const system = buildSystemPrompt({ ...context, sourceEvidence });

        let mentorReply: string;
        try {
          const raw = await runHarnessLlm(
            [
              { role: 'system', content: system },
              { role: 'user', content: nextLearnerMessage },
            ],
            2,
            {
              llmTier: context.llmTier,
              ageBracket: resolveAgeBracket(context.birthYear),
              conversationLanguage: 'en',
              responseFormat: 'json',
              sessionId: 'eval-misconception-repair',
            },
          );
          const parsed = parseFirstJsonObject<MentorEnvelopeLike>(raw);
          mentorReply =
            parsed && typeof parsed.reply === 'string' ? parsed.reply : raw;
        } catch (err) {
          mentorReply = `[mentor call failed: ${
            err instanceof Error ? err.message : String(err)
          }]`;
        }

        history.push({ role: 'user', content: nextLearnerMessage });
        history.push({ role: 'assistant', content: mentorReply });

        if (turn === MAX_MENTOR_TURNS - 1) break;

        // Simulated learner replies in character.
        try {
          nextLearnerMessage = await simulateLearnerTurn(
            scenario,
            input.learnerAge,
            history,
          );
        } catch (err) {
          nextLearnerMessage = `[learner sim failed: ${
            err instanceof Error ? err.message : String(err)
          }]`;
          history.push({ role: 'user', content: nextLearnerMessage });
          break;
        }
      }

      const verdict = await judgeTranscript(scenario, history);
      return JSON.stringify(
        {
          scenarioId: input.scenarioId,
          misconception: scenario.misconception,
          transcript: history,
          verdict,
        },
        null,
        2,
      );
    },

    evaluateQuality({ input, liveResponse }): QualityIssue[] {
      return evaluateMisconceptionVerdict(input, liveResponse);
    },
  };
