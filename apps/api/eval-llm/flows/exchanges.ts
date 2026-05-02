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
  substituteHistory,
  type HistoryTurn,
} from '../fixtures/exchange-histories';
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
      'First-turn / new-topic branch (rung 1, exchangeCount 0, retention new)',
    history: HISTORY_S1_RUNG1,
    contextOverrides: {
      escalationRung: 1,
      sessionType: 'learning',
      verificationType: 'standard',
      exchangeCount: 0,
      retentionStatus: { status: 'new' },
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
    []
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
      lower
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
    inputMode: 'text',
    llmTier: 'standard',
  };
}

function buildScenarioContext(
  profile: EvalProfile,
  spec: ScenarioSpec
): ExchangeContext {
  const base = buildBaseContext(profile);
  const topic = profile.libraryTopics[0] ?? 'this topic';
  const struggle = profile.struggles[0]?.topic ?? 'the tricky part';

  const history = substituteHistory(spec.history, { topic, struggle }).map(
    (t) => ({ role: t.role, content: t.content })
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
    profile: EvalProfile
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

    return {
      system,
      user: lastUserTurn?.content,
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

  // -------------------------------------------------------------------------
  // [AUDIT-EVAL-2 / 2026-05-02] First runLive in the harness — sets the
  // pattern for the other ~12 flows. Mirrors production processExchange
  // (apps/api/src/services/exchanges.ts:301) — same routeAndCall signature,
  // same per-context options (llmTier, ageBracket, conversationLanguage,
  // pronouns), same escalationRung. The wrapper tags telemetry with
  // flow: "eval-harness" so dashboards can filter eval calls out.
  //
  // Known divergence (tracked separately as AUDIT-EVAL-3): production
  // concatenates `buildOrphanSystemAddendum(...)` onto the system prompt;
  // this harness only sends `buildSystemPrompt(context)` (matching what
  // buildPrompt above produces, and what the Tier-1 snapshot displays).
  // We deliberately use messages.system here so the live call validates
  // the same prompt the snapshot shows — fixing the addendum gap means
  // updating buildPrompt too, which is its own scope.
  // -------------------------------------------------------------------------
  async runLive(
    input: ExchangeScenarioInput,
    messages: PromptMessages
  ): Promise<string> {
    const history = input.context.exchangeHistory;
    // The runner-passed `messages.user` was extracted from the last user
    // turn in history (see buildPrompt above). Send the rest of history as
    // prior context so the LLM sees the same multi-turn shape production
    // sees — otherwise envelope validation only covers single-turn replies.
    const lastUserIndex = (() => {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user') return i;
      }
      return -1;
    })();
    const priorTurns =
      lastUserIndex >= 0 ? history.slice(0, lastUserIndex) : history;

    // Contract guarantee: buildPrompt above always populates messages.user
    // for exchanges (last user turn extracted from history). Throw rather
    // than silently send an empty user turn so other flows copying this
    // pattern can't regress into invisible misbehaviour.
    if (!messages.user) {
      throw new Error(
        `runLive: messages.user is undefined for scenario ${input.scenarioId} — buildPrompt must produce a user turn`
      );
    }

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: messages.system },
      ...priorTurns.map((t) => ({
        role: t.role,
        // Mirror production sanitization (services/exchanges.ts:314) so
        // user-provided <server_note> markers in fixture history don't
        // bleed through to the LLM and confuse the orphan-addendum logic.
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
