import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from './llm';
import { generateCurriculum } from './curriculum';
import type { CurriculumInput } from './curriculum';

const sampleTopics = JSON.stringify([
  {
    title: 'Variables & Types',
    description: 'Learn about TypeScript type system',
    relevance: 'core',
    estimatedMinutes: 30,
  },
  {
    title: 'Functions',
    description: 'Typed function declarations',
    relevance: 'core',
    estimatedMinutes: 45,
  },
]);

/** Provider that returns a valid JSON curriculum */
function createCurriculumMockProvider(): LLMProvider {
  return {
    id: 'gemini',
    async chat(
      _messages: ChatMessage[],
      _config: ModelConfig
    ): Promise<string> {
      return `Here is your curriculum:\n${sampleTopics}`;
    },
    async *chatStream(
      _messages: ChatMessage[],
      _config: ModelConfig
    ): AsyncIterable<string> {
      yield sampleTopics;
    },
  };
}

const defaultInput: CurriculumInput = {
  subjectName: 'TypeScript',
  interviewSummary: 'Learner wants to build web apps.',
  goals: ['Build full-stack apps', 'Understand type safety'],
  experienceLevel: 'beginner',
};

describe('generateCurriculum', () => {
  beforeAll(() => {
    registerProvider(createCurriculumMockProvider());
  });

  afterAll(() => {
    // Restore the generic mock so other test suites are not affected
    registerProvider(createMockProvider('gemini'));
  });

  it('parses curriculum topics from LLM response', async () => {
    const topics = await generateCurriculum(defaultInput);

    expect(topics).toHaveLength(2);
    expect(topics[0].title).toBe('Variables & Types');
    expect(topics[1].relevance).toBe('core');
  });

  it('returns typed topic objects', async () => {
    const topics = await generateCurriculum(defaultInput);

    for (const topic of topics) {
      expect(topic).toHaveProperty('title');
      expect(topic).toHaveProperty('description');
      expect(topic).toHaveProperty('relevance');
      expect(topic).toHaveProperty('estimatedMinutes');
      expect(typeof topic.estimatedMinutes).toBe('number');
    }
  });

  it('throws when LLM response contains no JSON array', async () => {
    // Temporarily register a provider that returns non-JSON
    const badProvider: LLMProvider = {
      id: 'gemini',
      async chat(): Promise<string> {
        return 'Sorry, I cannot generate a curriculum right now.';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'nope';
      },
    };
    registerProvider(badProvider);

    await expect(generateCurriculum(defaultInput)).rejects.toThrow(
      'Failed to parse curriculum from LLM response'
    );

    // Restore curriculum mock for subsequent tests
    registerProvider(createCurriculumMockProvider());
  });
});
