import { llmResponseEnvelopeSchema } from '@eduagent/schemas';
import {
  buildSystemPrompt,
  sanitizeUserContent,
  type ExchangeContext,
} from '../../src/services/exchanges';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import type { ChatMessage } from '../../src/services/llm/types';
import type { EvalProfile } from '../fixtures/profiles';
import { runHarnessLlm } from '../runner/llm-client';
import {
  containsAny,
  parseFirstJsonObject,
  qualityError,
} from '../runner/quality';
import type {
  DeterministicCheckContext,
  FlowDefinition,
  PromptMessages,
  QualityCheckContext,
  QualityIssue,
  Scenario,
} from '../runner/types';

const TARGET_PROFILE_ID = '12yo-dinosaurs';

interface RequiredConcept {
  label: string;
  terms: string[];
}

export interface ParkAndReturnReweaveInput {
  scenarioId: string;
  purpose: string;
  context: ExchangeContext;
  returnCueTerms: string[];
  requiredConcepts: RequiredConcept[];
}

interface EnvelopeLike {
  reply?: unknown;
}

function buildBaseContext(profile: EvalProfile): ExchangeContext {
  return {
    sessionId: `eval-park-return-${profile.id}`,
    profileId: `eval-profile-${profile.id}`,
    subjectName: 'Science',
    topicTitle: 'Sauropod neck evolution',
    sessionType: 'learning',
    escalationRung: 1,
    exchangeHistory: [],
    birthYear: profile.birthYear,
    priorLearningContext:
      'Earlier dinosaur work: compared sauropod body plans, fossil evidence, and feeding-height tradeoffs.',
    crossSubjectContext:
      'Recent work in other subjects: proportional reasoning in maths, useful for comparing body size and circulation load.',
    embeddingMemoryContext:
      'Recent semantically-similar session: learner asked why huge dinosaur bodies create design tradeoffs, then parked the blood-pressure part for later.',
    learnerMemoryContext:
      'Learner memory:\n' +
      '- Parked question from earlier: "Why did sauropods have long necks if blood had to reach the brain?"\n' +
      '- Learner likes concrete animal examples before abstract biology terms.',
    teachingPreference: profile.preferredExplanations[0],
    analogyDomain: profile.analogyDomain,
    retentionStatus: {
      status: 'fading',
      daysSinceLastReview: 9,
    },
    rawInput: "Let's come back to the long-neck question now.",
    exchangeCount: 0,
    isFirstEncounter: false,
    inputMode: 'text',
    llmTier: 'standard',
    conversationLanguage:
      profile.conversationLanguage as ExchangeContext['conversationLanguage'],
    pronouns: profile.pronouns,
  };
}

function buildScenarios(
  profile: EvalProfile,
): Array<Scenario<ParkAndReturnReweaveInput>> {
  const base = buildBaseContext(profile);

  return [
    {
      scenarioId: 'parked-question-reweave',
      input: {
        scenarioId: 'parked-question-reweave',
        purpose:
          'Learner taps an aged parked-item card and expects the mentor to resume the old question, not start intake.',
        context: {
          ...base,
          resumeContext:
            'Parked question from earlier: "Why did sauropods have long necks if blood had to reach the brain?" The learner explicitly chose to return to it from the Now feed. Re-weave the old thread in one clause, answer the parked question directly, and do not treat this as a brand-new intake.',
        },
        returnCueTerms: [
          'back',
          'earlier',
          'left off',
          'come back',
          'return',
          'returned',
          'parked',
        ],
        requiredConcepts: [
          { label: 'parked topic', terms: ['sauropod', 'neck'] },
          {
            label: 'question substance',
            terms: ['blood', 'brain', 'heart', 'tradeoff', 'trade-off'],
          },
        ],
      },
    },
    {
      scenarioId: 'needs-deepening-return',
      input: {
        scenarioId: 'needs-deepening-return',
        purpose:
          'Learner returns to a needs-deepening item after it competed with due review cards.',
        context: {
          ...base,
          topicTitle: 'Stegosaurus plates and heat exchange',
          retentionStatus: {
            status: 'weak',
            daysSinceLastReview: 12,
          },
          rawInput: 'Can we finish the plate thing from last time?',
          resumeContext:
            'Needs-deepening handoff: the learner partly understood that Stegosaurus plates were not just armor, but confused display versus temperature regulation. They returned after this item waited behind due-review cards. Briefly name the return, refresh the old thread, then ask one concrete check question.',
          learnerMemoryContext:
            'Learner memory:\n' +
            '- Needs-deepening item from last time: Stegosaurus plates may have helped with display and heat exchange, not just armor.\n' +
            '- Learner tends to remember dinosaur facts when asked to compare two plausible explanations.',
        },
        returnCueTerms: [
          'back',
          'last time',
          'earlier',
          'return',
          'returned',
          'finish',
        ],
        requiredConcepts: [
          { label: 'returned topic', terms: ['plate', 'stegosaurus'] },
          {
            label: 'deepening point',
            terms: ['heat', 'temperature', 'display', 'armor'],
          },
        ],
      },
    },
  ];
}

function deterministicIssues(
  context: DeterministicCheckContext<ParkAndReturnReweaveInput>,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const system = context.messages.system;
  const input = context.input;

  if (
    input.context.resumeContext &&
    !system.includes(input.context.resumeContext)
  ) {
    issues.push(
      qualityError(
        'park-return.resume-context-missing',
        'Prompt did not include the return handoff / resume context.',
      ),
    );
  }
  if (
    input.context.learnerMemoryContext &&
    !system.includes(input.context.learnerMemoryContext)
  ) {
    issues.push(
      qualityError(
        'park-return.memory-context-missing',
        'Prompt did not include the return memory context.',
      ),
    );
  }
  if (context.messages.user !== input.context.rawInput) {
    issues.push(
      qualityError(
        'park-return.user-turn-mismatch',
        `Expected user turn "${input.context.rawInput}", got "${context.messages.user ?? ''}".`,
      ),
    );
  }

  return issues;
}

function extractReply(liveResponse: string): string | null {
  const parsed = parseFirstJsonObject<EnvelopeLike>(liveResponse);
  return parsed && typeof parsed.reply === 'string' ? parsed.reply : null;
}

function containsAnyTerm(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function qualityIssues(
  context: QualityCheckContext<ParkAndReturnReweaveInput>,
): QualityIssue[] {
  const reply = extractReply(context.liveResponse);
  if (!reply) {
    return [
      qualityError(
        'park-return.parse',
        'Live response did not contain a parseable envelope reply.',
      ),
    ];
  }

  const issues: QualityIssue[] = [];
  if (!containsAnyTerm(reply, context.input.returnCueTerms)) {
    issues.push(
      qualityError(
        'park-return.missing-return-cue',
        `Reply did not acknowledge that this is a returned/parked thread: ${reply}`,
      ),
    );
  }
  if (
    containsAny(reply, [
      /\bwhat would you like to learn\b/i,
      /\bwhat do you want to (?:learn|study)\b/i,
      /\bpick a topic\b/i,
      /\bchoose a topic\b/i,
    ])
  ) {
    issues.push(
      qualityError(
        'park-return.fresh-start',
        `Reply treated the returned thread like a new intake: ${reply}`,
      ),
    );
  }

  for (const concept of context.input.requiredConcepts) {
    if (!containsAnyTerm(reply, concept.terms)) {
      issues.push(
        qualityError(
          'park-return.missing-concept',
          `Reply missed the ${concept.label} from the parked context: ${reply}`,
        ),
      );
    }
  }

  return issues;
}

export const parkAndReturnReweaveFlow: FlowDefinition<ParkAndReturnReweaveInput> =
  {
    id: 'park-and-return-reweave',
    name: 'Park and Return Re-weave',
    sourceFile: 'apps/api/src/services/exchanges.ts:buildSystemPrompt',
    // Keep this out of aggregate envelope drift metrics until the full live
    // baseline is intentionally reseeded. Tier-2 still validates each sample
    // against llmResponseEnvelopeSchema via expectedResponseSchema.
    expectedResponseSchema: llmResponseEnvelopeSchema,

    buildPromptInput(): ParkAndReturnReweaveInput | null {
      return null;
    },

    enumerateScenarios(
      profile: EvalProfile,
    ): Array<Scenario<ParkAndReturnReweaveInput>> {
      return profile.id === TARGET_PROFILE_ID ? buildScenarios(profile) : [];
    },

    buildPrompt(input: ParkAndReturnReweaveInput): PromptMessages {
      return {
        system: buildSystemPrompt(input.context),
        user: input.context.rawInput ?? undefined,
        notes: [
          `Scenario: ${input.scenarioId} - ${input.purpose}`,
          `Topic: ${input.context.topicTitle ?? 'none'}`,
          `Resume context: ${input.context.resumeContext ?? 'none'}`,
          'Live quality checks require a return cue, the parked concept, and no fresh-start intake.',
        ],
      };
    },

    evaluateDeterministic: deterministicIssues,

    async runLive(
      input: ParkAndReturnReweaveInput,
      messages: PromptMessages,
    ): Promise<string> {
      if (messages.user === undefined) {
        throw new Error(
          `runLive: messages.user is undefined for scenario ${input.scenarioId} - buildPrompt must produce a user turn`,
        );
      }

      const chatMessages: ChatMessage[] = [
        { role: 'system', content: messages.system },
        { role: 'user', content: sanitizeUserContent(messages.user) },
      ];

      return runHarnessLlm(chatMessages, input.context.escalationRung, {
        llmTier: input.context.llmTier,
        ageBracket: resolveAgeBracket(input.context.birthYear),
        conversationLanguage: input.context.conversationLanguage,
        pronouns: input.context.pronouns,
        responseFormat: 'json',
      });
    },

    evaluateQuality: qualityIssues,
  };
