import {
  buildExchangeSourceEvidence,
  buildSystemPrompt,
  type ExchangeContext,
} from '../../src/services/exchanges';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import type { ConversationLanguage } from '@eduagent/schemas';
import type { EvalProfile } from '../fixtures/profiles';
import { PROFILES } from '../fixtures/profiles';
import {
  TEACHING_SCENARIOS,
  SCENARIO_BAND_LABEL,
  assertScenarioProfilesResolve,
  getTeachingScenario,
} from '../fixtures/teaching-scenarios';
import type { TeachingScenario } from '../fixtures/teaching-scenarios';
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
// Startup guard — hard-error if any scenario's profileId has no matching
// EvalProfile (MEDIUM-2). Runs at module import time so a typo fails loud
// before any scenario silently disappears.
// ---------------------------------------------------------------------------
assertScenarioProfilesResolve(PROFILES);

// ---------------------------------------------------------------------------
// Flow adapter — Teaching Session (multi-turn, unaided transfer probe, LLM-judged)
//
// Answers: "across a realistic session, does the mentor actually teach a
// concept well enough that the learner can use it afterward — without looping,
// losing context, or just handing over the answer?"
//
// Four judged dimensions:
//   Transfer / retention    — unaided novel probe at the end → error if 'no'
//   Scaffolding / pace      — mentor matched learner's age + gap → warning if wrong
//   Coherence               — mentor did NOT loop or contradict → warning if true
//   Told-not-taught         — mentor reasoned, not just asserted → warning if true
//
// Model separation mirrors misconception-repair.ts:
//   MENTOR   → runHarnessLlm  (candidate-override-able via --openrouter-model)
//   LEARNER  → callLlm        (override-immune; production routing)
//   JUDGE    → callLlm        (override-immune; production routing)
//
// The simulated learner is inline (copied from misconception-repair pattern) —
// NOT from learner-agent.ts, which belongs to the challenge-grader sim (MEDIUM-1).
//
// Learner constraint: stays at its startingGap competence for the WHOLE loop
// AND the transfer probe. It only advances on a concept the mentor explicitly
// taught — never from the model's own pretraining (HIGH-4 / F2).
//
// AUDIENCE SCOPE: PRE-TEEN/TEEN-BAND PRE-SCREEN ONLY (11–17yo) — see
// SCENARIO_BAND_LABEL. Says nothing about under-10 or adult teaching quality.
//
// Cost note: each scenario makes up to (8 mentor + 7 learner + 1 probe +
// 1 judge) ≈ 17 internal calls. The runner's --max-live-calls counts runLive
// invocations (one per scenario × profile match), not internal calls — budget
// for the multiplier when seeding.
// ---------------------------------------------------------------------------

const MAX_MENTOR_TURNS = 8;

interface DialogueTurn {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// ExchangeContext builder
// ---------------------------------------------------------------------------

function buildContext(
  profile: EvalProfile,
  scenario: TeachingScenario,
  history: DialogueTurn[],
): ExchangeContext {
  return {
    sessionId: `eval-ts-${scenario.id}`,
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
    // Use the profile's actual conversationLanguage so TS05 (Czech, 11yo) tests
    // non-English tutor-prose as intended. Unlike misconception-repair which
    // hardcodes 'en', this flow deliberately exercises the multilingual path.
    conversationLanguage: profile.conversationLanguage as ConversationLanguage,
  };
}

// ---------------------------------------------------------------------------
// Simulated learner (inline — NOT learner-agent.ts, MEDIUM-1)
// ---------------------------------------------------------------------------

function learnerSystemPrompt(
  scenario: TeachingScenario,
  age: number,
  conversationLanguage: string,
): string {
  const langNote =
    conversationLanguage !== 'en'
      ? 'Respond in the same language the tutor is using in this conversation. '
      : '';
  return (
    `You are role-playing a ${age}-year-old student in a tutoring chat. ${langNote}` +
    `Your hidden knowledge gap at the START of this session: "${scenario.startingGap}" ` +
    'CRITICAL CONSTRAINT: You ONLY know what the tutor has explicitly taught you in this conversation. ' +
    'Do NOT draw on any knowledge from outside this conversation — not from school, not from memory, not from pretraining. ' +
    'Stay at your starting-gap competence level unless the tutor gives a clear, specific, concrete explanation that directly addresses your gap. ' +
    "If the tutor's explanation is vague, abstract, or just asserts the answer without reasoning through it, stay confused or ask a follow-up. " +
    'Only demonstrate genuine understanding if the tutor has genuinely addressed your gap with a clear explanation. ' +
    'Respond as the student in 1–3 short, natural sentences. Stay in character at all times. ' +
    "Output ONLY the student's next message. No quotation marks, no narration, no labels."
  );
}

function renderDialogue(history: DialogueTurn[]): string {
  return history
    .map((t) => `${t.role === 'assistant' ? 'Tutor' : 'You'}: ${t.content}`)
    .join('\n');
}

async function simulateLearnerTurn(
  scenario: TeachingScenario,
  age: number,
  conversationLanguage: string,
  history: DialogueTurn[],
): Promise<string> {
  const raw = await callLlm(
    [
      {
        role: 'system',
        content: learnerSystemPrompt(scenario, age, conversationLanguage),
      },
      {
        role: 'user',
        content: `${renderDialogue(history)}\n\nWhat do you say next?`,
      },
    ],
    { flow: 'eval-sim-learner-teaching', rung: 2 },
  );
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Transfer probe (separate from the teaching loop)
//
// The learner answers an unaided novel question using ONLY what was taught in
// THIS conversation, at their taught (not latent) competence (HIGH-4 / F2).
// The mentor does NOT participate in the probe.
// ---------------------------------------------------------------------------

function transferProbePrompt(
  scenario: TeachingScenario,
  age: number,
  conversationLanguage: string,
  conversationText: string,
): string {
  const langNote =
    conversationLanguage !== 'en'
      ? 'Respond in the same language used in the tutoring conversation above. '
      : '';
  return (
    `You are a ${age}-year-old student. ${langNote}` +
    `At the start of the tutoring session you had this knowledge gap:\n"${scenario.startingGap}"\n\n` +
    `Here is the full tutoring conversation that just happened:\n${conversationText}\n\n` +
    'Now answer the following question based ONLY on what the tutor explicitly explained to you in the conversation above. ' +
    'Do NOT use any knowledge from outside this conversation. ' +
    'If a concept was clearly explained to you, show your understanding. ' +
    'If it was not clearly explained, answer as best you can based only on what you heard.\n\n' +
    `Question: ${scenario.transferProbe}`
  );
}

async function simulateTransferProbe(
  scenario: TeachingScenario,
  age: number,
  conversationLanguage: string,
  history: DialogueTurn[],
): Promise<string> {
  const conversationText = renderDialogue(history);
  const raw = await callLlm(
    [
      {
        role: 'user',
        content: transferProbePrompt(
          scenario,
          age,
          conversationLanguage,
          conversationText,
        ),
      },
    ],
    { flow: 'eval-teaching-transfer-probe', rung: 2 },
  );
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Judge
// ---------------------------------------------------------------------------

export interface TeachingVerdict {
  transfer?: 'yes' | 'partial' | 'no' | unknown;
  scaffolding_appropriate?: unknown; // bool
  looped_or_incoherent?: unknown; // bool
  told_not_taught?: unknown; // bool
  evidence?: unknown; // one-sentence quote
}

function judgeSystemPrompt(): string {
  return (
    'You are evaluating whether a tutor TAUGHT a concept well enough for a student to apply it in a new situation. ' +
    'The transcript and student answer may be in a non-English language — evaluate the teaching quality regardless of language.\n\n' +
    'Judge the teaching on four dimensions:\n' +
    '- transfer: "yes" if the student correctly answered the transfer probe using what was taught (not from outside knowledge); ' +
    '"partial" if the answer shows partial understanding or is shaky; ' +
    '"no" if the answer is incorrect or still reflects the original knowledge gap.\n' +
    "- scaffolding_appropriate: true if the mentor matched the student's apparent age and starting knowledge level well; " +
    'false if clearly too fast, too slow, or mismatched to the learner.\n' +
    '- looped_or_incoherent: true if the mentor repeated the same explanation verbatim without progress, or contradicted an earlier turn.\n' +
    '- told_not_taught: true if the mentor mostly stated facts or gave the answer directly without explaining the underlying reasoning or engaging the student.\n\n' +
    'Reply with ONLY a JSON object, no prose before or after:\n' +
    '{"transfer": "yes"|"partial"|"no", "scaffolding_appropriate": <bool>, "looped_or_incoherent": <bool>, "told_not_taught": <bool>, "evidence": "<one short sentence quoting the key evidence for your transfer verdict>"}'
  );
}

function judgeUserPrompt(
  scenario: TeachingScenario,
  history: DialogueTurn[],
  transferAnswer: string,
): string {
  return (
    `Student's starting knowledge gap: ${scenario.startingGap}\n` +
    `Correct understanding / transfer rubric: ${scenario.transferRubric}\n\n` +
    `Teaching transcript:\n${renderDialogue(history)}\n\n` +
    `Transfer probe question: ${scenario.transferProbe}\n` +
    `Student's unaided answer to the probe: ${transferAnswer}`
  );
}

async function judgeTranscript(
  scenario: TeachingScenario,
  history: DialogueTurn[],
  transferAnswer: string,
): Promise<TeachingVerdict | { error: string }> {
  let raw: string;
  try {
    raw = await callLlm(
      [
        { role: 'system', content: judgeSystemPrompt() },
        {
          role: 'user',
          content: judgeUserPrompt(scenario, history, transferAnswer),
        },
      ],
      // TODO(verify): temperature option — callLlm does not expose a temperature
      // parameter (spec M8/F3 requires temperature:0 for the judge to reduce
      // verdict variability). Add `temperature: 0` when routeAndCall / callLlm
      // exposes it as a caller option.
      { flow: 'eval-teaching-judge', rung: 2, responseFormat: 'json' },
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  const verdict = parseFirstJsonObject<TeachingVerdict>(raw);
  return verdict ?? { error: 'unparseable judge verdict' };
}

// ---------------------------------------------------------------------------
// Verdict → quality issues (exported for deterministic unit testing)
// ---------------------------------------------------------------------------

export interface TeachingSessionInput {
  scenarioId: string;
  topicTitle: string;
  startingGap: string;
  learnerOpening: string;
  profileId: string;
  context: ExchangeContext;
  learnerAge: number;
}

interface TeachingRunLiveResult {
  verdict?: TeachingVerdict | { error: string };
}

export function evaluateTeachingVerdict(
  input: TeachingSessionInput,
  liveResponse: string,
): QualityIssue[] {
  const parsed = parseFirstJsonObject<TeachingRunLiveResult>(liveResponse);
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
        `Judge did not return a usable verdict (${String(verdict.error)}) — transcript NOT judged.`,
      ),
    ];
  }

  const v = verdict as TeachingVerdict;
  const issues: QualityIssue[] = [];
  const evidence =
    typeof v.evidence === 'string' && v.evidence ? ` Judge: ${v.evidence}` : '';

  // Transfer is the ONLY error-class dimension — maps directly to product failure.
  if (v.transfer === 'no') {
    issues.push(
      qualityError(
        `${input.scenarioId}.transfer-failed`,
        `Learner could not apply the concept after teaching — unaided transfer failed.${evidence}`,
      ),
    );
  } else if (v.transfer === 'partial') {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.transfer-partial`,
        `Transfer only partial — learner partially applies the concept but is still shaky.${evidence}`,
      ),
    );
  } else if (v.transfer !== 'yes') {
    // Unrecognised value
    issues.push(
      qualityWarning(
        `${input.scenarioId}.transfer-unknown`,
        `Judge returned an unrecognised transfer value: ${String(v.transfer)}.`,
      ),
    );
  }

  // Soft dimensions — warnings only, never block the run.
  if (v.scaffolding_appropriate === false) {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.scaffolding-poor`,
        `Mentor's scaffolding was not appropriate for the learner's age and starting gap.${evidence}`,
      ),
    );
  }

  if (v.looped_or_incoherent === true) {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.looped-or-incoherent`,
        `Mentor looped or contradicted an earlier explanation.${evidence}`,
      ),
    );
  }

  if (v.told_not_taught === true) {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.told-not-taught`,
        `Mentor mostly stated facts without teaching the reasoning.${evidence}`,
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

export const teachingSessionFlow: FlowDefinition<TeachingSessionInput> = {
  id: 'teaching-session',
  name: 'Teaching Session (multi-turn, transfer probe, LLM-judged)',
  sourceFile: 'apps/api/src/services/exchanges.ts:buildSystemPrompt',

  buildPromptInput(): TeachingSessionInput | null {
    // Not used — enumerateScenarios fans out instead.
    return null;
  },

  enumerateScenarios(
    profile: EvalProfile,
  ): Array<Scenario<TeachingSessionInput>> | null {
    const scenarios: Array<Scenario<TeachingSessionInput>> = [];
    for (const spec of TEACHING_SCENARIOS) {
      if (spec.profileId !== profile.id) continue;
      scenarios.push({
        scenarioId: spec.id,
        input: {
          scenarioId: spec.id,
          topicTitle: spec.topicTitle,
          startingGap: spec.startingGap,
          learnerOpening: spec.learnerOpening,
          profileId: profile.id,
          context: buildContext(profile, spec, []),
          learnerAge: profile.ageYears,
        },
      });
    }
    return scenarios.length > 0 ? scenarios : null;
  },

  buildPrompt(input: TeachingSessionInput): PromptMessages {
    // Tier 1 renders the OPENING mentor turn — the system prompt the mentor
    // sees when first hit with the learner's opening message.
    // The multi-turn simulation only runs under --live (runLive).
    const sourceEvidence = buildExchangeSourceEvidence(
      input.context,
      input.learnerOpening,
    );
    const system = buildSystemPrompt({ ...input.context, sourceEvidence });
    return {
      system,
      user: input.learnerOpening,
      notes: [
        `Teaching-session scenario: ${input.scenarioId}`,
        `Topic: ${input.topicTitle}`,
        `Starting gap: ${input.startingGap}`,
        `Audience scope: ${SCENARIO_BAND_LABEL}`,
        `Tier 1 shows only the OPENING mentor turn. Tier 2 runs up to ${MAX_MENTOR_TURNS} mentor turns against a stuck-unless-taught simulated learner, then an unaided transfer probe, then an LLM judge.`,
        'Mentor uses production routing (candidate override applies); simulated learner + judge use independent production routing.',
      ],
    };
  },

  async runLive(
    input: TeachingSessionInput,
    _messages: PromptMessages,
  ): Promise<string> {
    const scenario = getTeachingScenario(input.scenarioId);
    if (!scenario) {
      return JSON.stringify({
        verdict: { error: `unknown scenario ${input.scenarioId}` },
      });
    }

    const history: DialogueTurn[] = [];
    let nextLearnerMessage = input.learnerOpening;
    const conversationLanguage = input.context.conversationLanguage ?? 'en';

    for (let turn = 0; turn < MAX_MENTOR_TURNS; turn++) {
      // Mentor turn — production system prompt with the dialogue so far baked
      // into context.exchangeHistory. Swap in the growing history each turn.
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
            conversationLanguage: conversationLanguage as ConversationLanguage,
            responseFormat: 'json',
            sessionId: `eval-teaching-session-${scenario.id}`,
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

      // Simulated learner replies in character — stays at startingGap unless
      // the mentor has genuinely taught the concept (HIGH-4 constraint).
      try {
        nextLearnerMessage = await simulateLearnerTurn(
          scenario,
          input.learnerAge,
          conversationLanguage,
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

    // Transfer probe: learner answers the pre-authored novel question unaided.
    // The mentor does NOT answer it — this tests whether teaching led to
    // genuine understanding, not just in-dialogue repetition (HIGH-4).
    let transferAnswer: string;
    try {
      transferAnswer = await simulateTransferProbe(
        scenario,
        input.learnerAge,
        conversationLanguage,
        history,
      );
    } catch (err) {
      transferAnswer = `[transfer probe failed: ${
        err instanceof Error ? err.message : String(err)
      }]`;
    }

    // Judge reads the full transcript + transfer answer and returns
    // the four-field TeachingVerdict.
    const verdict = await judgeTranscript(scenario, history, transferAnswer);

    return JSON.stringify(
      {
        // SCENARIO_BAND_LABEL surfaced in the snapshot so a reader sees the
        // teen-band caveat without opening the fixture file (F1/M7).
        band: SCENARIO_BAND_LABEL,
        scenarioId: input.scenarioId,
        transcript: history,
        transferAnswer,
        verdict,
      },
      null,
      2,
    );
  },

  evaluateQuality({ input, liveResponse }): QualityIssue[] {
    return evaluateTeachingVerdict(input, liveResponse);
  },
};
