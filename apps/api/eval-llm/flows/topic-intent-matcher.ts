import { z } from 'zod';

import {
  buildTopicIntentMatcherMessages,
  MATCH_CONFIDENCE_FLOOR,
} from '../../src/services/session/session-crud';
import { routeAndCall } from '../../src/services/llm/router';
import { getTextContent } from '../../src/services/llm/types';
import type { EvalProfile } from '../fixtures/profiles';
import { bootstrapLlmProviders } from '../runner/llm-bootstrap';
import type { FlowDefinition, PromptMessages, Scenario } from '../runner/types';

interface TopicFixture {
  id: string;
  title: string;
}

interface TopicIntentMatcherInput {
  rawInput: string;
  topics: TopicFixture[];
  expectedTitle: string | null;
}

const topicIntentEvalResponseSchema = z.object({
  matchTopicId: z.string().uuid().nullable(),
  confidence: z.number().min(0).max(1),
});

const CHEMISTRY_TOPICS: TopicFixture[] = [
  { id: '00000000-0000-7000-8000-000000000101', title: 'Atoms' },
  { id: '00000000-0000-7000-8000-000000000102', title: 'Periodic Table' },
  { id: '00000000-0000-7000-8000-000000000103', title: 'Chemical Reactions' },
  { id: '00000000-0000-7000-8000-000000000104', title: 'Acids and Bases' },
  { id: '00000000-0000-7000-8000-000000000105', title: 'Stoichiometry' },
];

const ITALIAN_TOPICS: TopicFixture[] = [
  { id: '00000000-0000-7000-8000-000000000201', title: 'Pronunciation' },
  { id: '00000000-0000-7000-8000-000000000202', title: 'Greetings' },
  { id: '00000000-0000-7000-8000-000000000203', title: 'Verb conjugation' },
  { id: '00000000-0000-7000-8000-000000000204', title: 'Nouns and Articles' },
];

const HISTORY_TOPICS: TopicFixture[] = [
  { id: '00000000-0000-7000-8000-000000000301', title: 'Anglo-Saxon England' },
  { id: '00000000-0000-7000-8000-000000000302', title: 'Battle of Hastings' },
  { id: '00000000-0000-7000-8000-000000000303', title: 'Norman Rule' },
];

const PHYSICS_TOPICS: TopicFixture[] = [
  { id: '00000000-0000-7000-8000-000000000401', title: 'Motion' },
  { id: '00000000-0000-7000-8000-000000000402', title: 'Energy' },
];

const FIXTURES: Array<{
  scenarioId: string;
  input: TopicIntentMatcherInput;
}> = [
  {
    scenarioId: 'chemical-reactions-question',
    input: {
      rawInput: 'how are chemical reactions created',
      topics: CHEMISTRY_TOPICS,
      expectedTitle: 'Chemical Reactions',
    },
  },
  {
    scenarioId: 'atom-question',
    input: {
      rawInput: 'what is an atom',
      topics: CHEMISTRY_TOPICS,
      expectedTitle: 'Atoms',
    },
  },
  {
    scenarioId: 'broad-chemistry',
    input: {
      rawInput: 'I want to learn chemistry',
      topics: CHEMISTRY_TOPICS,
      expectedTitle: null,
    },
  },
  {
    scenarioId: 'italian-verbs',
    input: {
      rawInput: 'verb conjugation in Italian',
      topics: ITALIAN_TOPICS,
      expectedTitle: 'Verb conjugation',
    },
  },
  {
    scenarioId: 'battle-of-hastings',
    input: {
      rawInput: 'battle of hastings',
      topics: HISTORY_TOPICS,
      expectedTitle: 'Battle of Hastings',
    },
  },
  {
    scenarioId: 'spanish-chemical-reactions',
    input: {
      rawInput: 'reacciones quimicas',
      topics: CHEMISTRY_TOPICS,
      expectedTitle: 'Chemical Reactions',
    },
  },
  {
    scenarioId: 'acids-and-bases',
    input: {
      rawInput: 'why do acids taste sour',
      topics: CHEMISTRY_TOPICS,
      expectedTitle: 'Acids and Bases',
    },
  },
  {
    scenarioId: 'stoichiometry-moles',
    input: {
      rawInput: 'what are moles in chemical equations',
      topics: CHEMISTRY_TOPICS,
      expectedTitle: 'Stoichiometry',
    },
  },
  {
    scenarioId: 'single-topic-curriculum',
    input: {
      rawInput: 'how plants make food',
      topics: [
        {
          id: '00000000-0000-7000-8000-000000000501',
          title: 'Photosynthesis',
        },
      ],
      expectedTitle: 'Photosynthesis',
    },
  },
  {
    scenarioId: 'broad-two-topic',
    input: {
      rawInput: 'Physics',
      topics: PHYSICS_TOPICS,
      expectedTitle: null,
    },
  },
];

function expectedTopicId(input: TopicIntentMatcherInput): string | null {
  if (!input.expectedTitle) return null;
  return (
    input.topics.find((topic) => topic.title === input.expectedTitle)?.id ??
    null
  );
}

export const topicIntentMatcherFlow: FlowDefinition<TopicIntentMatcherInput> = {
  id: 'topic-intent-matcher',
  name: 'Topic intent matcher',
  sourceFile:
    'apps/api/src/services/session/session-crud.ts:buildTopicIntentMatcherMessages',

  buildPromptInput(_profile: EvalProfile): TopicIntentMatcherInput | null {
    return null;
  },

  enumerateScenarios(
    profile: EvalProfile,
  ): Array<Scenario<TopicIntentMatcherInput>> | null {
    if (profile.id !== '11yo-czech-animals') return null;
    return FIXTURES;
  },

  buildPrompt(input: TopicIntentMatcherInput): PromptMessages {
    const [system, user] = buildTopicIntentMatcherMessages(input);
    return {
      system: getTextContent(system?.content ?? ''),
      user: getTextContent(user?.content ?? ''),
      notes: [
        `Expected title: ${input.expectedTitle ?? 'null'}`,
        `Confidence floor: ${MATCH_CONFIDENCE_FLOOR}`,
      ],
    };
  },

  expectedResponseSchema: topicIntentEvalResponseSchema,

  async runLive(
    input: TopicIntentMatcherInput,
    messages: PromptMessages,
  ): Promise<string> {
    bootstrapLlmProviders();
    const result = await routeAndCall(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      1,
      { flow: 'topic-intent-matcher', llmTier: 'flash' },
    );
    const parsed = topicIntentEvalResponseSchema.safeParse(
      JSON.parse(result.response.match(/\{[\s\S]*\}/)?.[0] ?? result.response),
    );
    if (!parsed.success) {
      throw new Error('Topic matcher response failed schema validation');
    }
    const expectedId = expectedTopicId(input);
    const actualId =
      parsed.data.confidence >= MATCH_CONFIDENCE_FLOOR
        ? parsed.data.matchTopicId
        : null;
    if (actualId !== expectedId) {
      const actualTitle =
        input.topics.find((topic) => topic.id === actualId)?.title ?? 'null';
      throw new Error(
        `Expected ${input.expectedTitle ?? 'null'}, got ${actualTitle}`,
      );
    }
    return result.response;
  },
};
