import {
  buildSystemPrompt,
  sanitizeUserContent,
  type ExchangeContext,
} from '../../src/services/exchanges';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import { buildMemoryBlock } from '../../src/services/learner-profile';
import type { ChatMessage } from '../../src/services/llm/types';
import { llmResponseEnvelopeSchema } from '@eduagent/schemas';
import type { EvalProfile } from '../fixtures/profiles';
import { runHarnessLlm } from '../runner/llm-client';
import {
  HISTORY_S1_RUNG1,
  HISTORY_S2_RUNG2,
  HISTORY_S3_RUNG3,
  HISTORY_S4_RUNG4,
  HISTORY_S5_RUNG5,
  HISTORY_S6_HOMEWORK,
  HISTORY_S7_LANGUAGE,
  HISTORY_S8_FREEFORM,
  HISTORY_S9_CORRECT_STREAK,
  substituteHistory,
  type HistoryTurn,
} from '../fixtures/exchange-histories';
import {
  HISTORY_APP_HELP_MEMORY,
  HISTORY_APP_HELP_MODES,
  HISTORY_APP_HELP_NOTES,
  HISTORY_APP_HELP_PREFERENCES,
} from '../fixtures/exchange-histories-app-help';
import type { FlowDefinition, PromptMessages, Scenario } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Main tutoring loop (exchanges.buildSystemPrompt)
//
// This is the largest prompt surface in the codebase (~25 context fields,
// ~750-line system prompt). Rather than snapshot per profile like the other
// 8 flows, this flow fans each profile out into 8 scenarios that exercise
// distinct branches of the prompt builder.
//
// Full scenario matrix and synthesis strategy documented in
// `docs/plans/2026-04-19-exchanges-harness-wiring.md`.
// ---------------------------------------------------------------------------

export interface ExchangeScenarioInput {
  scenarioId: string;
  context: ExchangeContext;
  /** Short human-readable summary of what this scenario exercises. */
  scenarioPurpose: string;
}

interface ScenarioSpec {
  id: string;
  purpose: string;
  history: HistoryTurn[];
  contextOverrides: Partial<ExchangeContext>;
  /**
   * Filter out scenarios that only make sense for a subset of profiles.
   * Returning false means "this scenario is skipped for this profile".
   */
  appliesTo(profile: EvalProfile): boolean;
}

const SCENARIO_SPECS: readonly ScenarioSpec[] = [
  {
    id: 'S1-rung1-teach-new',
    purpose:
      'First-turn returning-topic branch (rung 1, exchangeCount 0, retention new, normal learner action)',
    history: HISTORY_S1_RUNG1,
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 0,
      isFirstEncounter: false,
      isFirstSessionOfSubject: false,
      retentionStatus: { status: 'new' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S10-first-encounter-topic-turn0',
    purpose:
      'First-encounter topic turn 0 — teach exactly one idea, then ask a focused prior-knowledge probe',
    history: [],
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 0,
      isFirstEncounter: true,
      isFirstSessionOfSubject: false,
      retentionStatus: { status: 'new' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S11-first-encounter-topic-turn1',
    purpose:
      'First-encounter topic turn 1 — react to the learner signal, teach one nugget, ask one follow-up',
    history: [
      {
        role: 'assistant',
        content:
          'Plants make sugar from sunlight, water, and carbon dioxide. What part of that have you seen before?',
      },
      {
        role: 'user',
        content:
          'I know plants need sun, but I do not know what carbon dioxide does.',
      },
    ],
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 1,
      isFirstEncounter: true,
      isFirstSessionOfSubject: false,
      retentionStatus: { status: 'new' },
      extractedSignalsToReflect: {
        currentKnowledge: 'knows plants need sunlight',
      },
    },
    appliesTo: () => true,
  },
  {
    id: 'S12-first-encounter-topic-turn3',
    purpose:
      'First-encounter topic turn 3 — final allowed probe turn before normal teaching resumes',
    history: [
      {
        role: 'assistant',
        content:
          'Plants use carbon dioxide as one ingredient for sugar. What do you think the water is for?',
      },
      {
        role: 'user',
        content: 'Maybe water is food for the plant?',
      },
      {
        role: 'assistant',
        content:
          'Close: water is an ingredient, not the finished food. What feels unclear about that split?',
      },
      {
        role: 'user',
        content: 'I mix up ingredients and energy.',
      },
    ],
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 3,
      isFirstEncounter: true,
      isFirstSessionOfSubject: false,
      retentionStatus: { status: 'new' },
      extractedSignalsToReflect: {
        currentKnowledge: 'mixes up ingredients and energy',
      },
    },
    appliesTo: () => true,
  },
  {
    id: 'S13-first-session-subject-turn0',
    purpose:
      'Very first subject session turn 0 — subject-level opener wins over topic probe',
    history: [],
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 0,
      isFirstEncounter: true,
      isFirstSessionOfSubject: true,
      retentionStatus: { status: 'new' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S14-returning-topic-turn0',
    purpose:
      'Returning-topic first turn — regression guard for original 5b teach-plus-action rule',
    history: [],
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 0,
      isFirstEncounter: false,
      isFirstSessionOfSubject: false,
      retentionStatus: { status: 'strong' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S2-rung2-revisit',
    purpose: 'Escalation + SM-2 review (rung 2, fading retention, mid-session)',
    history: HISTORY_S2_RUNG2,
    contextOverrides: {
      escalationRung: 2,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 2,
      retentionStatus: {
        status: 'fading',
        easeFactor: 2.3,
        daysSinceLastReview: 14,
      },
    },
    appliesTo: () => true,
  },
  {
    id: 'S3-rung3-evaluate',
    purpose: "Devil's Advocate / structured assessment path (rung 3)",
    history: HISTORY_S3_RUNG3,
    contextOverrides: {
      escalationRung: 3,
      sessionType: 'learning',
      verificationType: 'evaluate',
      evaluateDifficultyRung: 2,
      exchangeCount: 3,
      retentionStatus: { status: 'strong' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S4-rung4-teach-back',
    purpose: 'Feynman rubric path (rung 4, teach_back verification)',
    history: HISTORY_S4_RUNG4,
    contextOverrides: {
      escalationRung: 4,
      sessionType: 'learning',
      verificationType: 'teach_back',
      exchangeCount: 4,
      retentionStatus: { status: 'strong' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S5-rung5-exit',
    purpose: 'Rung-5 exit protocol — F1.3 NEEDS_DEEPENING migration target',
    history: HISTORY_S5_RUNG5,
    contextOverrides: {
      escalationRung: 5,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 5,
      retentionStatus: { status: 'weak' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S6-homework-help',
    purpose: 'Homework mode (help_me) — not tutoring',
    history: HISTORY_S6_HOMEWORK,
    contextOverrides: {
      escalationRung: 2,
      sessionType: 'homework',
      verificationType: 'standard',
      homeworkMode: 'help_me',
      exchangeCount: 1,
      retentionStatus: { status: 'new' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S7-language-fluency',
    purpose:
      'Four-strands pedagogy, fluency drill candidate — F2.2 ui_hints target',
    history: HISTORY_S7_LANGUAGE,
    contextOverrides: {
      escalationRung: 2,
      sessionType: 'learning',
      verificationType: 'standard',
      pedagogyMode: 'four_strands',
      exchangeCount: 2,
      retentionStatus: { status: 'fading', daysSinceLastReview: 7 },
    },
    appliesTo: (p) => Boolean(p.targetLanguage && p.cefrLevel),
  },
  {
    id: 'S8-casual-freeform',
    purpose: 'Freeform / casual-mode branch (no topic, casual tone)',
    history: HISTORY_S8_FREEFORM,
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      learningMode: 'casual',
      exchangeCount: 1,
    },
    appliesTo: () => true,
  },
  {
    id: 'S9-correct-streak',
    purpose:
      'Correct-streak ADAPTIVE ESCALATION trigger — 4 consecutive correct answers at the same rung should prompt the streak branch',
    history: HISTORY_S9_CORRECT_STREAK,
    contextOverrides: {
      escalationRung: 2,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 4,
      // correctStreak >= 4 activates the ADAPTIVE ESCALATION prompt branch
      correctStreak: 4,
    },
    appliesTo: () => true,
  },
  {
    id: 'S15-review-mode-opener',
    purpose:
      'Review mode turn-0 — calibration opener prompt fires for effectiveMode=review',
    history: [],
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 0,
      effectiveMode: 'review',
      retentionStatus: { status: 'fading', daysSinceLastReview: 7 },
    },
    appliesTo: () => true,
  },
  {
    id: 'S16-app-help-notes',
    purpose: 'App-help: user asks where to find notes mid-session',
    history: HISTORY_APP_HELP_NOTES,
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 1,
      isFirstEncounter: false,
      isFirstSessionOfSubject: false,
      retentionStatus: { status: 'new' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S17-app-help-preferences',
    purpose: 'App-help: user asks how to change learning preferences',
    history: HISTORY_APP_HELP_PREFERENCES,
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 1,
      isFirstEncounter: false,
      isFirstSessionOfSubject: false,
      retentionStatus: { status: 'new' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S18-app-help-modes',
    purpose: 'App-help: user asks about Explorer vs Challenge mode',
    history: HISTORY_APP_HELP_MODES,
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 1,
      isFirstEncounter: false,
      isFirstSessionOfSubject: false,
      retentionStatus: { status: 'new' },
    },
    appliesTo: () => true,
  },
  {
    id: 'S19-app-help-memory',
    purpose: 'App-help: user asks where to see mentor memory',
    history: HISTORY_APP_HELP_MEMORY,
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 1,
      isFirstEncounter: false,
      isFirstSessionOfSubject: false,
      retentionStatus: { status: 'new' },
    },
    appliesTo: () => true,
  },
];

// ---------------------------------------------------------------------------
// Context synthesis — deterministic, derived from the profile.
// ---------------------------------------------------------------------------

function buildSyntheticMemoryBlock(profile: EvalProfile): string {
  const now = new Date();
  const isoNow = now.toISOString();

  const memoryProfile = {
    learningStyle: {
      preferredExplanations: profile.preferredExplanations,
      pacePreference: profile.pacePreference,
      corroboratingSessions: 3,
    },
    interests: profile.interests.map((i) => i.label),
    strengths: profile.strengths.map((s) => ({
      subject: s.subject ?? 'general',
      topics: [s.topic],
      confidence: 'medium' as const,
    })),
    struggles: profile.struggles.map((s) => ({
      subject: s.subject,
      topic: s.topic,
      lastSeen: isoNow,
      attempts: 2,
      confidence: 'medium' as const,
    })),
    communicationNotes: [],
    memoryEnabled: true,
    memoryInjectionEnabled: true,
    memoryConsentStatus: 'granted',
    effectivenessSessionCount: 3,
  };

  const currentSubject = inferSubjectFromTopic(profile.libraryTopics[0] ?? '');
  const currentTopic = profile.libraryTopics[0] ?? null;

  const block = buildMemoryBlock(
    memoryProfile,
    currentSubject,
    currentTopic,
    null,
    [],
  );
  return block.text;
}

function buildEmbeddingMemorySnippet(profile: EvalProfile): string {
  const recentTopic = profile.libraryTopics[0] ?? 'this area';
  const recentStruggle = profile.struggles[0]?.topic ?? 'something new';
  return `Recent semantically-similar session: learner was working on ${recentTopic} and had trouble with ${recentStruggle}. They responded well to ${
    profile.preferredExplanations[0] ?? 'examples'
  }-based explanations.`;
}

function buildPriorLearningSnippet(profile: EvalProfile): string {
  const prior = profile.libraryTopics.slice(1, 3);
  const strengthTopics = profile.strengths.map((s) => s.topic).slice(0, 2);
  const parts: string[] = [];
  if (prior.length > 0) {
    parts.push(`Recently completed topics: ${prior.join(', ')}.`);
  }
  if (strengthTopics.length > 0) {
    parts.push(`Demonstrated strength in: ${strengthTopics.join(', ')}.`);
  }
  return parts.join(' ');
}

function buildCrossSubjectSnippet(profile: EvalProfile): string {
  const tail = profile.libraryTopics.slice(-1);
  if (tail.length === 0) return '';
  return `Recent work in other subjects: ${tail[0]}.`;
}

function inferSubjectFromTopic(topic: string): string {
  const lower = topic.toLowerCase();
  if (/spanish|french|italian|german|english|czech/.test(lower))
    return 'Languages';
  if (
    /algebra|fraction|multiplication|division|polynomial|arithmetic/.test(lower)
  )
    return 'Mathematics';
  if (/physic|newton|force|motion/.test(lower)) return 'Physics';
  if (/history|civil war|reconstruction|enlightenment/.test(lower))
    return 'History';
  if (/philosoph|existentialis|camus/.test(lower)) return 'Philosophy';
  if (
    /biolog|body|cycle|animal|dinosaur|fossil|paleontolog|mesozoic|plate/.test(
      lower,
    )
  )
    return 'Science';
  if (/read|comprehension|essay|subjunctive|writing|story|reading/.test(lower))
    return 'Language Arts';
  return 'Freeform';
}

function buildBaseContext(profile: EvalProfile): ExchangeContext {
  const topic = profile.libraryTopics[0] ?? 'a new topic';
  const subject = inferSubjectFromTopic(topic);

  return {
    sessionId: `eval-${profile.id}`,
    profileId: `eval-profile-${profile.id}`,
    subjectName: subject,
    topicTitle: topic,
    topicDescription: undefined,
    sessionType: 'learning',
    escalationRung: 1,
    exchangeHistory: [],
    birthYear: profile.birthYear,
    priorLearningContext: buildPriorLearningSnippet(profile),
    crossSubjectContext: buildCrossSubjectSnippet(profile),
    embeddingMemoryContext: buildEmbeddingMemorySnippet(profile),
    learnerMemoryContext: buildSyntheticMemoryBlock(profile),
    teachingPreference: profile.preferredExplanations[0],
    analogyDomain: profile.analogyDomain,
    nativeLanguage: profile.nativeLanguage,
    languageCode: profile.targetLanguage,
    knownVocabulary: profile.recentQuizAnswers.vocabulary.length
      ? profile.recentQuizAnswers.vocabulary
      : undefined,
    learningMode: profile.learningMode,
    exchangeCount: 0,
    isFirstEncounter: false,
    isFirstSessionOfSubject: false,
    extractedSignalsToReflect: null,
    inputMode: 'text',
    llmTier: 'standard',
  };
}

function buildScenarioContext(
  profile: EvalProfile,
  spec: ScenarioSpec,
): ExchangeContext {
  const base = buildBaseContext(profile);
  const topic = profile.libraryTopics[0] ?? 'this topic';
  const struggle = profile.struggles[0]?.topic ?? 'the tricky part';

  const history = substituteHistory(spec.history, { topic, struggle }).map(
    (t) => ({ role: t.role, content: t.content }),
  );

  return {
    ...base,
    ...spec.contextOverrides,
    exchangeHistory: history,
    topicTitle:
      spec.contextOverrides.learningMode === 'casual'
        ? undefined
        : base.topicTitle,
  };
}

export const exchangesFlow: FlowDefinition<ExchangeScenarioInput> = {
  id: 'exchanges',
  name: 'Exchanges (main tutoring loop)',
  sourceFile: 'apps/api/src/services/exchanges.ts:buildSystemPrompt',
  emitsEnvelope: true,
  expectedResponseSchema: llmResponseEnvelopeSchema,

  buildPromptInput(): ExchangeScenarioInput | null {
    // Not used — enumerateScenarios fans out instead.
    return null;
  },

  enumerateScenarios(
    profile: EvalProfile,
  ): Array<Scenario<ExchangeScenarioInput>> {
    const scenarios: Array<Scenario<ExchangeScenarioInput>> = [];
    for (const spec of SCENARIO_SPECS) {
      if (!spec.appliesTo(profile)) continue;
      scenarios.push({
        scenarioId: spec.id,
        input: {
          scenarioId: spec.id,
          scenarioPurpose: spec.purpose,
          context: buildScenarioContext(profile, spec),
        },
      });
    }
    return scenarios;
  },

  buildPrompt(input: ExchangeScenarioInput): PromptMessages {
    const system = buildSystemPrompt(input.context);
    const lastUserTurn = [...input.context.exchangeHistory]
      .reverse()
      .find((t) => t.role === 'user');
    const firstTurnUser =
      input.context.exchangeCount === 0
        ? (input.context.rawInput ??
          `Start a learning session about ${
            input.context.topicTitle ?? input.context.subjectName
          }.`)
        : undefined;

    return {
      system,
      user: lastUserTurn?.content ?? firstTurnUser,
      notes: [
        `Scenario: ${input.scenarioId} — ${input.scenarioPurpose}`,
        `Rung: ${input.context.escalationRung}, sessionType: ${
          input.context.sessionType
        }, verification: ${input.context.verificationType ?? 'standard'}`,
        `History turns: ${
          input.context.exchangeHistory.length
        }, exchangeCount: ${input.context.exchangeCount ?? 0}`,
        `Synthesized contexts: learnerMemoryContext (real buildMemoryBlock), embeddingMemoryContext (derived), priorLearningContext (derived), crossSubjectContext (derived)`,
        `expectedResponseSchema: llmResponseEnvelopeSchema — validates envelope shape on --live runs`,
      ],
    };
  },

  // Uses messages.system as-is — production adds buildOrphanSystemAddendum but the harness omits it so the live run validates the same prompt the Tier-1 snapshot displays.
  async runLive(
    input: ExchangeScenarioInput,
    messages: PromptMessages,
  ): Promise<string> {
    const history = input.context.exchangeHistory;
    const lastUserIndex = (() => {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i]!.role === 'user') return i;
      }
      return -1;
    })();
    const priorTurns =
      lastUserIndex >= 0 ? history.slice(0, lastUserIndex) : history;

    if (messages.user === undefined) {
      throw new Error(
        `runLive: messages.user is undefined for scenario ${input.scenarioId} — buildPrompt must produce a user turn`,
      );
    }

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: messages.system },
      ...priorTurns.map((t) => ({
        role: t.role,
        // Mirror production sanitization: sanitizeUserContent in processExchange — strips <server_note> markers from fixture history.
        content: t.role === 'user' ? sanitizeUserContent(t.content) : t.content,
      })),
      { role: 'user' as const, content: sanitizeUserContent(messages.user) },
    ];

    return runHarnessLlm(chatMessages, input.context.escalationRung, {
      llmTier: input.context.llmTier,
      ageBracket: resolveAgeBracket(input.context.birthYear),
      conversationLanguage: input.context.conversationLanguage,
      pronouns: input.context.pronouns,
    });
  },
};
