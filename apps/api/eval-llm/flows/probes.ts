import {
  buildSystemPrompt,
  type ExchangeContext,
} from '../../src/services/exchanges';
import { buildMemoryBlock } from '../../src/services/learner-profile';
import { llmResponseEnvelopeSchema } from '@eduagent/schemas';
import { PROBE_BATTERY, type ProbeSpec } from '../fixtures/probes/battery';
import { substituteHistory } from '../fixtures/exchange-histories';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages, Scenario } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

// ---------------------------------------------------------------------------
// Flow adapter — Probe Battery (pre-launch LLM tuning)
//
// Fans each profile into up to 30 probe scenarios. Each probe exercises an
// orthogonal behavioral dimension: age, input_mode, subject, mood,
// session_state, answer_quality, memory, streak.
//
// Probes with a non-null `profileFilter` are only emitted for the listed
// profile IDs. All-profile probes (profileFilter: null) generate one snapshot
// per profile, totalling up to 5 × (number of all-profile probes) snapshots.
//
// Context synthesis mirrors the exchanges flow exactly — the same
// buildBaseContext helpers are used so snapshot deltas reflect prompt logic
// changes, not harness drift.
// ---------------------------------------------------------------------------

export interface ProbeScenarioInput {
  probeId: string;
  description: string;
  category: string;
  context: ExchangeContext;
  userMessage: string;
}

// ---------------------------------------------------------------------------
// Context synthesis — deterministic, derived from the profile.
// Mirrors exchanges.ts exactly so the two flows stay comparable.
// ---------------------------------------------------------------------------

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

function buildBaseContext(profile: EvalProfile): ExchangeContext {
  const topic = profile.libraryTopics[0] ?? 'a new topic';
  const subject = inferSubjectFromTopic(topic);

  const priorTopics = profile.libraryTopics.slice(1, 3);
  const strengthTopics = profile.strengths.map((s) => s.topic).slice(0, 2);
  const priorParts: string[] = [];
  if (priorTopics.length > 0) {
    priorParts.push(`Recently completed topics: ${priorTopics.join(', ')}.`);
  }
  if (strengthTopics.length > 0) {
    priorParts.push(`Demonstrated strength in: ${strengthTopics.join(', ')}.`);
  }

  const tailTopics = profile.libraryTopics.slice(-1);
  const crossSubject =
    tailTopics.length > 0
      ? `Recent work in other subjects: ${tailTopics[0]}.`
      : '';

  const recentTopic = profile.libraryTopics[0] ?? 'this area';
  const recentStruggle = profile.struggles[0]?.topic ?? 'something new';
  const embeddingMemory = `Recent semantically-similar session: learner was working on ${recentTopic} and had trouble with ${recentStruggle}. They responded well to ${
    profile.preferredExplanations[0] ?? 'examples'
  }-based explanations.`;

  return {
    sessionId: `eval-probe-${profile.id}`,
    profileId: `eval-profile-${profile.id}`,
    subjectName: subject,
    topicTitle: topic,
    topicDescription: undefined,
    sessionType: 'learning',
    escalationRung: 1,
    exchangeHistory: [],
    birthYear: profile.birthYear,
    priorLearningContext: priorParts.join(' '),
    crossSubjectContext: crossSubject,
    embeddingMemoryContext: embeddingMemory,
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

function buildProbeContext(
  profile: EvalProfile,
  probe: ProbeSpec
): ExchangeContext {
  const base = buildBaseContext(profile);
  const topic = profile.libraryTopics[0] ?? 'this topic';
  const struggle = profile.struggles[0]?.topic ?? 'the tricky part';

  const history = substituteHistory(probe.history, { topic, struggle }).map(
    (t) => ({ role: t.role, content: t.content })
  );

  return {
    ...base,
    ...probe.contextOverrides,
    exchangeHistory: history,
    // When the probe sets learningMode to 'casual' (or casual is inherited from
    // the profile default) and does NOT supply an explicit topicTitle override,
    // clear topicTitle — mirrors the exchanges.ts casual-mode branch.
    topicTitle:
      probe.contextOverrides.learningMode === 'casual' &&
      probe.contextOverrides.topicTitle === undefined
        ? undefined
        : probe.contextOverrides.topicTitle !== undefined
        ? probe.contextOverrides.topicTitle
        : base.topicTitle,
  };
}

// ---------------------------------------------------------------------------
// Flow definition
// ---------------------------------------------------------------------------

export const probesFlow: FlowDefinition<ProbeScenarioInput> = {
  id: 'probes',
  name: 'Probe Battery (pre-launch tuning)',
  sourceFile: 'apps/api/src/services/exchanges.ts:buildSystemPrompt',
  emitsEnvelope: true,
  expectedResponseSchema: llmResponseEnvelopeSchema,

  buildPromptInput(): ProbeScenarioInput | null {
    // Not used — enumerateScenarios fans out instead.
    return null;
  },

  enumerateScenarios(
    profile: EvalProfile
  ): Array<Scenario<ProbeScenarioInput>> | null {
    const scenarios: Array<Scenario<ProbeScenarioInput>> = [];

    for (const probe of PROBE_BATTERY) {
      // Skip probes that don't apply to this profile.
      if (
        probe.profileFilter !== null &&
        !probe.profileFilter.includes(profile.id)
      ) {
        continue;
      }

      scenarios.push({
        scenarioId: probe.id,
        input: {
          probeId: probe.id,
          description: probe.description,
          category: probe.category,
          context: buildProbeContext(profile, probe),
          userMessage: probe.userMessage,
        },
      });
    }

    return scenarios.length > 0 ? scenarios : null;
  },

  buildPrompt(input: ProbeScenarioInput): PromptMessages {
    const system = buildSystemPrompt(input.context);

    return {
      system,
      user: input.userMessage,
      notes: [
        `Probe: ${input.probeId} [${input.category}] — ${input.description}`,
        `Rung: ${input.context.escalationRung}, sessionType: ${
          input.context.sessionType
        }, verification: ${input.context.verificationType ?? 'standard'}`,
        `History turns: ${
          input.context.exchangeHistory.length
        }, exchangeCount: ${input.context.exchangeCount ?? 0}`,
        `inputMode: ${input.context.inputMode ?? 'text'}, learningMode: ${
          input.context.learningMode ?? 'default'
        }`,
        `topicTitle: ${input.context.topicTitle ?? '(none — casual mode)'}`,
        `expectedResponseSchema: llmResponseEnvelopeSchema — validates envelope shape on --live runs`,
      ],
    };
  },

  async runLive(
    input: ProbeScenarioInput,
    messages: PromptMessages
  ): Promise<string> {
    // Use the rung from the probe context so model routing matches what
    // production would select for this scenario.
    const rung = (input.context.escalationRung ?? 1) as 1 | 2 | 3 | 4 | 5;
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      { flow: 'probes', rung }
    );
  },
};
