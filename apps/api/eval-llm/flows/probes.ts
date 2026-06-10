import {
  applySourceAuditSafetyFallback,
  auditExchangeSources,
  buildExchangeSourceEvidence,
  buildSystemPrompt,
  inferObviousReliableSourceForAudit,
  type ExchangeContext,
  type ExchangePrivateSources,
} from '../../src/services/exchanges';
import { buildMemoryBlock } from '../../src/services/learner-profile';
import { llmResponseEnvelopeSchema } from '@eduagent/schemas';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import { PROBE_BATTERY, type ProbeSpec } from '../fixtures/probes/battery';
import { substituteHistory } from '../fixtures/exchange-histories';
import type { EvalProfile } from '../fixtures/profiles';
import type {
  FlowDefinition,
  PromptMessages,
  QualityIssue,
  Scenario,
} from '../runner/types';
import { runHarnessLlm } from '../runner/llm-client';
import {
  containsAny,
  normalizeText,
  parseFirstJsonObject,
  qualityError,
  qualityWarning,
} from '../runner/quality';

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
      lower,
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
    [],
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
    exchangeCount: 0,
    inputMode: 'text',
    llmTier: 'standard',
  };
}

function buildProbeContext(
  profile: EvalProfile,
  probe: ProbeSpec,
): ExchangeContext {
  const base = buildBaseContext(profile);
  const topic = profile.libraryTopics[0] ?? 'this topic';
  const struggle = profile.struggles[0]?.topic ?? 'the tricky part';

  const history = substituteHistory(probe.history, { topic, struggle }).map(
    (t) => ({ role: t.role, content: t.content }),
  );
  const hasTopicTitleOverride = Object.prototype.hasOwnProperty.call(
    probe.contextOverrides,
    'topicTitle',
  );

  return {
    ...base,
    ...probe.contextOverrides,
    exchangeHistory: history,
    // When the probe does NOT supply an explicit topicTitle override,
    // keep the base topicTitle from the profile.
    topicTitle: hasTopicTitleOverride
      ? probe.contextOverrides.topicTitle
      : base.topicTitle,
  };
}

interface EnvelopeLike {
  reply?: unknown;
  private_sources?: {
    relied_on?: unknown;
    insufficient?: unknown;
    reason?: unknown;
  };
}

function parseEnvelopeForQuality(raw: string):
  | {
      reply: string;
      lowerReply: string;
      reliedOn: string[];
      insufficient: boolean;
    }
  | { issues: QualityIssue[] } {
  const parsed = parseFirstJsonObject<EnvelopeLike>(raw);
  if (!parsed || typeof parsed.reply !== 'string') {
    return {
      issues: [
        qualityError(
          'envelope.parse',
          'Live response did not contain a parseable envelope with a string reply.',
        ),
      ],
    };
  }

  const reliedRaw = parsed.private_sources?.relied_on;
  const reliedOn = Array.isArray(reliedRaw)
    ? reliedRaw.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    reply: parsed.reply,
    lowerReply: parsed.reply.toLowerCase(),
    reliedOn,
    insufficient: parsed.private_sources?.insufficient === true,
  };
}

function requireInsufficient(
  issues: QualityIssue[],
  insufficient: boolean,
  code: string,
  message: string,
): void {
  if (!insufficient) issues.push(qualityError(code, message));
}

function requireSource(
  issues: QualityIssue[],
  reliedOn: string[],
  sourceId: string,
  probeId: string,
): void {
  if (!reliedOn.includes(sourceId)) {
    issues.push(
      qualityError(
        `${probeId}.source.${sourceId}`,
        `Expected private_sources.relied_on to include "${sourceId}".`,
      ),
    );
  }
}

function evaluateSourceGroundingProbe(
  input: ProbeScenarioInput,
  liveResponse: string,
): QualityIssue[] {
  const parsed = parseEnvelopeForQuality(liveResponse);
  if ('issues' in parsed) return parsed.issues;
  const { lowerReply, reliedOn, insufficient } = parsed;
  const issues: QualityIssue[] = [];

  if (input.probeId === 'SGA01') {
    requireInsufficient(
      issues,
      insufficient,
      'SGA01.insufficient',
      'No reliable source is loaded, so the reply must mark source support insufficient.',
    );
    if (
      containsAny(lowerReply, [
        /\b(main reasons?|because)\b[^.?!]{0,80}\b(army|roads?|tax|trade networks?|conquer)/i,
        /\bthe roman empire grew\b/i,
      ])
    ) {
      issues.push(
        qualityError(
          'SGA01.memory-fact',
          'Reply appears to answer Roman Empire growth from memory instead of asking for source material.',
        ),
      );
    }
  }

  if (input.probeId === 'SGA02') {
    requireInsufficient(
      issues,
      insufficient,
      'SGA02.thin-source',
      'The source supports only a broad trade idea, not specific goods or importance ranking.',
    );
    if (
      containsAny(lowerReply, [
        /\binteresting (thought|idea)\b/i,
        /\bgood (point|observation)\b/i,
        /\bfair point\b/i,
      ])
    ) {
      issues.push(
        qualityError(
          'SGA02.soft-validation',
          'Unsupported learner factual claims need neutral acknowledgement, not validating openers.',
        ),
      );
    }
  }

  if (input.probeId === 'SGA03') {
    requireSource(issues, reliedOn, 'current_topic', input.probeId);
    if (
      containsAny(lowerReply, [
        /\bmud\b/i,
        /\bsand\b/i,
        /\bsoil\b/i,
        /\bstone copy\b/i,
        /\bmillions of years\b/i,
        /\bturns? into rock\b/i,
        /\blayers? of rock\b/i,
      ])
    ) {
      issues.push(
        qualityError(
          'SGA03.unsourced-detail',
          'Reliable fossil source is narrow; reply added formation details not present in the source excerpt.',
        ),
      );
    }
  }

  if (input.probeId === 'SGA04') {
    requireInsufficient(
      issues,
      insufficient,
      'SGA04.unsupported-claim',
      'Learner claim about conquest and spices is unsupported by the reliable source.',
    );
    if (
      containsAny(lowerReply, [
        /^\s*yes\b/i,
        /\b(can confirm|confirmed|that'?s right|you'?re right|you are right)\b/i,
        /\bmainly because merchants wanted rare spices\b/i,
      ]) &&
      !containsAny(lowerReply, [/\b(can'?t|cannot|does not|doesn'?t|not)\b/i])
    ) {
      issues.push(
        qualityError(
          'SGA04.confirmed-unsupported',
          'Reply appears to confirm an unsupported learner claim.',
        ),
      );
    }
  }

  if (input.probeId === 'SGA05') {
    requireInsufficient(
      issues,
      insufficient,
      'SGA05.memory-only',
      'Prior learning memory is not reliable factual support for a WWI causation claim.',
    );
  }

  if (input.probeId === 'SGA06') {
    requireInsufficient(
      issues,
      insufficient,
      'SGA06.chat-source',
      'Forum/chat-like history is not reliable factual support for a grammar rule.',
    );
    if (
      containsAny(lowerReply, [
        /\bser\b[^.?!]{0,80}\b(always|permanent)\b/i,
        /\bestar\b[^.?!]{0,80}\b(always|temporary)\b/i,
      ]) &&
      !containsAny(lowerReply, [
        /\bnot (reliable|enough|supported)\b/i,
        /\b(class )?chat rule\b/i,
        /\bshortcut\b/i,
      ])
    ) {
      issues.push(
        qualityError(
          'SGA06.memory-grammar',
          'Reply taught the ser/estar rule from memory instead of withholding without a reliable grammar source.',
        ),
      );
    }
  }

  return issues;
}

function evaluateHomeworkProbe(
  input: ProbeScenarioInput,
  liveResponse: string,
): QualityIssue[] {
  const parsed = parseEnvelopeForQuality(liveResponse);
  if ('issues' in parsed) return parsed.issues;
  const { lowerReply, reliedOn, insufficient } = parsed;
  const issues: QualityIssue[] = [];

  if (input.probeId === 'HW01') {
    requireSource(issues, reliedOn, 'homework_problem', input.probeId);
    requireSource(issues, reliedOn, 'deterministic_reasoning', input.probeId);
    if (
      !/\bx\s*=\s*6\b/i.test(lowerReply) &&
      !(
        /2x\s*\+\s*5\s*=\s*17/i.test(lowerReply) &&
        // A problem-specific first step counts whether phrased imperatively
        // ("subtract 5") or Socratically ("what's your first move to get x
        // by itself?") — both anchor on THIS equation, which is what the
        // probe distinguishes from a generic algebra lecture.
        /\b(first step|first operation|first number|first move|subtract 5|move the constant|move away|both sides|isolating 2x|isolate|by itself)\b/i.test(
          lowerReply,
        )
      )
    ) {
      issues.push(
        qualityError(
          'HW01.answer',
          'Enough deterministic problem text is present; reply should either solve to x = 6 or give a problem-specific first step.',
        ),
      );
    }
  }

  if (input.probeId === 'HW02') {
    requireInsufficient(
      issues,
      insufficient,
      'HW02.too-little-text',
      'The worksheet text is incomplete, so the model should ask for the missing source/photo.',
    );
    if (/\bquestion 4 (is|means|answer)\b/i.test(lowerReply)) {
      issues.push(
        qualityError(
          'HW02.solved-from-memory',
          'Reply appears to answer incomplete worksheet question 4 from memory.',
        ),
      );
    }
  }

  if (input.probeId === 'HW03') {
    requireSource(issues, reliedOn, 'homework_problem', input.probeId);
    if (
      /\b(correct|right)\b/i.test(lowerReply) &&
      !/\bnot\b/i.test(lowerReply) &&
      // "You're right that cansado means tired! However, … use estar" is the
      // DESIRED move: acknowledging a valid SUB-FACT ("right that …" /
      // "right about …") before contradicting the conflicting answer. Only
      // that acknowledgment form is exempt — a direct validation ("that's
      // correct!") stays flagged even when followed by a contrast word.
      !/\b(correct|right)\s+(that|about)\b/i.test(lowerReply)
    ) {
      issues.push(
        qualityError(
          'HW03.conflict',
          'Conflicting learner answer should not be marked correct.',
        ),
      );
    }
  }

  if (input.probeId === 'HW04') {
    requireInsufficient(
      issues,
      insufficient,
      'HW04.blurry-photo',
      'The visible photo text is cut off, so the reply should ask for clearer source material.',
    );
    if (
      containsAny(lowerReply, [
        /\bcities grew near rivers because\b/i,
        /\bfertile soil\b/i,
        /\btransportation\b/i,
        /\bwater for crops\b/i,
      ])
    ) {
      issues.push(
        qualityError(
          'HW04.photo-invention',
          'Reply filled in the cut-off photo sentence from memory.',
        ),
      );
    }
  }

  return issues;
}

function evaluatePersonalizationProbe(
  input: ProbeScenarioInput,
  liveResponse: string,
): QualityIssue[] {
  const parsed = parseEnvelopeForQuality(liveResponse);
  if ('issues' in parsed) return parsed.issues;
  const lowerReply = normalizeText(parsed.reply);
  const issues: QualityIssue[] = [];

  if (
    containsAny(lowerReply, [
      /\bbecause you have (adhd|autism)\b/i,
      /\bpeople with (adhd|autism)\b/i,
      /\badhd brains?\b/i,
      /\bautistic learners?\b/i,
    ])
  ) {
    issues.push(
      qualityError(
        `${input.probeId}.stereotype`,
        'Personalization should adapt structure without naming or stereotyping the accommodation.',
      ),
    );
  }

  if (
    containsAny(lowerReply, [
      /\bexcellent idea\b/i,
      /\bgreat question\b/i,
      /\bawesome\b/i,
      /\byou'?re amazing\b/i,
    ])
  ) {
    issues.push(
      qualityWarning(
        `${input.probeId}.generic-praise`,
        'Prefer specific, calm acknowledgement over generic enthusiasm.',
      ),
    );
  }

  if (
    ['PM01', 'PM02', 'PM05', 'PM06'].includes(input.probeId) &&
    !(input.probeId === 'PM06' && lowerReply.split(/\s+/).length <= 35) &&
    !containsAny(lowerReply, [
      /\bfirst\b/i,
      /\bone (step|thing|sentence|quick)\b/i,
      /\bstep by step\b/i,
      /\bstart with\b/i,
      /\bsimple one\b/i,
      /\bshort\b/i,
      /\bsmall\b/i,
      /\bquick\b/i,
    ])
  ) {
    issues.push(
      qualityWarning(
        `${input.probeId}.structure`,
        'Accommodation scenario should show lightweight structure or short-burst pacing.',
      ),
    );
  }

  return issues;
}

function evaluateProbeQuality(
  input: ProbeScenarioInput,
  liveResponse: string,
): QualityIssue[] {
  if (input.probeId.startsWith('SGA')) {
    return evaluateSourceGroundingProbe(input, liveResponse);
  }
  if (input.probeId.startsWith('HW')) {
    return evaluateHomeworkProbe(input, liveResponse);
  }
  if (input.probeId.startsWith('PM')) {
    return evaluatePersonalizationProbe(input, liveResponse);
  }
  return [];
}

function readPrivateSources(
  value: unknown,
): ExchangePrivateSources | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as {
    relied_on?: unknown;
    insufficient?: unknown;
    reason?: unknown;
  };
  return {
    relied_on: Array.isArray(candidate.relied_on)
      ? candidate.relied_on.filter(
          (item): item is string => typeof item === 'string',
        )
      : undefined,
    insufficient:
      typeof candidate.insufficient === 'boolean'
        ? candidate.insufficient
        : undefined,
    reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
  };
}

function applyProductionSourceSafety(
  input: ProbeScenarioInput,
  rawResponse: string,
): string {
  const parsed = parseFirstJsonObject<Record<string, unknown>>(rawResponse);
  if (!parsed || typeof parsed.reply !== 'string') return rawResponse;

  const sourceEvidence = buildExchangeSourceEvidence(
    input.context,
    input.userMessage,
  );
  const privateSources = readPrivateSources(parsed.private_sources);
  const inferred = inferObviousReliableSourceForAudit(
    privateSources,
    sourceEvidence,
    parsed.reply,
  );
  const audit = auditExchangeSources(inferred, sourceEvidence);
  const safe = applySourceAuditSafetyFallback(parsed.reply, audit);
  if (
    safe.response === parsed.reply &&
    safe.sourceAudit.status === audit.status &&
    inferred === privateSources &&
    safe.sourceAudit.unsupportedSourceIds.length === 0
  ) {
    return rawResponse;
  }

  const supportedIds = new Set(sourceEvidence.map((item) => item.id));
  const reliedOn = safe.sourceAudit.reliedOnSourceIds.filter((id) =>
    supportedIds.has(id),
  );

  return JSON.stringify(
    {
      ...parsed,
      reply: safe.response,
      private_sources: {
        relied_on: reliedOn,
        insufficient: safe.sourceAudit.insufficient,
        reason: safe.sourceAudit.reason ?? null,
      },
    },
    null,
    2,
  );
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
    profile: EvalProfile,
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
    const sourceEvidence = buildExchangeSourceEvidence(
      input.context,
      input.userMessage,
    );
    const system = buildSystemPrompt({
      ...input.context,
      sourceEvidence,
    });

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
        `inputMode: ${input.context.inputMode ?? 'text'}`,
        `topicTitle: ${input.context.topicTitle ?? '(none — freeform)'}`,
        `sourceEvidence: ${sourceEvidence
          .map(
            (item) =>
              `${item.id}:${item.reliableForFacts ? 'reliable' : 'context'}`,
          )
          .join(', ')}`,
        `expectedResponseSchema: llmResponseEnvelopeSchema — validates envelope shape on --live runs`,
      ],
    };
  },

  async runLive(
    input: ProbeScenarioInput,
    messages: PromptMessages,
  ): Promise<string> {
    // Use the rung from the probe context so model routing matches what
    // production would select for this scenario.
    const rung = (input.context.escalationRung ?? 1) as 1 | 2 | 3 | 4 | 5;
    const rawResponse = await runHarnessLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      rung,
      {
        llmTier: input.context.llmTier,
        providerPolicy: input.context.llmProviderPolicy,
        preferredProvider: input.context.preferredLlmProvider,
        ageBracket: resolveAgeBracket(input.context.birthYear),
        conversationLanguage: input.context.conversationLanguage,
        pronouns: input.context.pronouns,
        responseFormat: 'json',
        sessionId: 'eval-probes',
      },
    );
    return applyProductionSourceSafety(input, rawResponse);
  },

  evaluateQuality({ input, liveResponse }): QualityIssue[] {
    return evaluateProbeQuality(input, liveResponse);
  },
};
