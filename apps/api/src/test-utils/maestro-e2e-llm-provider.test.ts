import { resetLlmMiddleware } from '../middleware/llm';
import { detectSubjectType } from '../services/book-generation';
import { prepareHomework } from '../services/dictation/prepare-homework';
import { reviewDictation } from '../services/dictation/review';
import { streamExchange } from '../services/exchanges';
import { _resetCircuits } from '../services/llm';
import { resolveSubjectName } from '../services/subject-resolve';
import { app } from './maestro-e2e-worker';
import { registerMaestroE2eLlmProvider } from './maestro-e2e-llm-provider';

beforeEach(() => {
  registerMaestroE2eLlmProvider();
});

afterEach(() => {
  jest.restoreAllMocks();
  resetLlmMiddleware();
  _resetCircuits();
});

describe('hosted Maestro LLM provider', () => {
  it.each([
    {
      input: 'The sun is warm.',
      sentences: [
        {
          text: 'The sun is warm.',
          withPunctuation: 'The sun is warm period',
          wordCount: 4,
          chunks: ['The sun is warm.'],
          chunksWithPunctuation: ['The sun is warm period'],
        },
      ],
    },
    {
      input: 'The sun is warm. Birds can sing.',
      sentences: [
        {
          text: 'The sun is warm.',
          withPunctuation: 'The sun is warm period',
          wordCount: 4,
          chunks: ['The sun is warm.'],
          chunksWithPunctuation: ['The sun is warm period'],
        },
        {
          text: 'Birds can sing.',
          withPunctuation: 'Birds can sing period',
          wordCount: 3,
          chunks: ['Birds can sing.'],
          chunksWithPunctuation: ['Birds can sing period'],
        },
      ],
    },
  ])(
    '[WI-1864] prepares planned release-flow homework text: $input',
    async ({ input, sentences }) => {
      await expect(prepareHomework(input)).resolves.toEqual({
        sentences,
        language: 'en',
      });
    },
  );

  it('preserves the fixture after a no-key development request crosses LLM middleware', async () => {
    jest.spyOn(console, 'warn').mockImplementation();

    // Mirror hosted Wrangler: application ENVIRONMENT stays development and
    // .dev.vars provides no provider keys. The request must cross llmMiddleware
    // without clearing the entrypoint's pre-registered boundary fixture.
    const health = await app.request('/v1/health', {}, {
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    } as never);
    expect(health.status).toBe(200);

    const mistakeReview = await reviewDictation({
      sentences: [
        {
          text: 'The sun is warm.',
          withPunctuation: 'The sun is warm period',
          wordCount: 4,
        },
      ],
      imageBase64: 'Zml4dHVyZQ==',
      imageMimeType: 'image/png',
      language: 'en',
    });
    expect(mistakeReview).toMatchObject({
      totalSentences: 1,
      correctCount: 0,
      mistakes: [
        {
          sentenceIndex: 0,
          original: 'The sun is warm.',
          error: 'spelling',
          correction: 'The sun is warm.',
        },
      ],
    });

    const perfectReview = await reviewDictation({
      sentences: [
        {
          text: 'The sun is warm.',
          withPunctuation: 'The sun is warm period',
          wordCount: 4,
        },
        {
          text: 'Birds can sing.',
          withPunctuation: 'Birds can sing period',
          wordCount: 3,
        },
      ],
      imageBase64: 'Zml4dHVyZQ==',
      imageMimeType: 'image/png',
      language: 'en',
    });
    expect(perfectReview).toEqual({
      totalSentences: 2,
      correctCount: 2,
      mistakes: [],
    });

    const correctedResolution = await resolveSubjectName('Phsics');
    expect(correctedResolution).toMatchObject({
      status: 'corrected',
      resolvedName: 'Physics',
      suggestions: [
        {
          name: 'Physics',
          description: expect.any(String),
        },
      ],
    });

    for (const plannedSubject of ['Test Math', 'Biology']) {
      await expect(resolveSubjectName(plannedSubject)).resolves.toMatchObject({
        status: 'direct_match',
        resolvedName: plannedSubject,
      });
    }

    const resolution = await resolveSubjectName('Photosynthesis');
    expect(resolution).toMatchObject({
      status: 'direct_match',
      resolvedName: 'Photosynthesis',
      suggestions: [
        {
          name: 'Photosynthesis',
          description: expect.any(String),
        },
      ],
    });
    if (resolution.resolvedName !== 'Photosynthesis') {
      throw new Error('The named Photosynthesis case did not resolve');
    }

    const structure = await detectSubjectType(resolution.resolvedName, 12);
    expect(structure).toMatchObject({
      type: 'narrow',
      topics: expect.arrayContaining([
        expect.objectContaining({
          title: 'How Plants Capture Light',
          description: expect.any(String),
        }),
      ]),
    });

    const exchange = await streamExchange(
      {
        sessionId: 'maestro-session',
        profileId: 'maestro-profile',
        subjectName: resolution.resolvedName,
        topicTitle: 'How Plants Capture Light',
        topicDescription: 'How leaves collect light energy for making food',
        sessionType: 'learning',
        escalationRung: 1,
        exchangeHistory: [],
        birthYear: 2000,
      },
      'How should we start?',
    );
    let visibleReply = '';
    for await (const chunk of exchange.stream) {
      visibleReply += chunk;
    }

    expect(visibleReply).toBe(
      "Let's work through this together. What have you noticed so far?",
    );
  });
});
