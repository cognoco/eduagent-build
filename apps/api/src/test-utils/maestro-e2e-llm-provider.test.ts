import { resetLlmMiddleware } from '../middleware/llm';
import { detectSubjectType } from '../services/book-generation';
import { streamExchange } from '../services/exchanges';
import { _resetCircuits } from '../services/llm';
import { resolveSubjectName } from '../services/subject-resolve';
import { app } from './maestro-e2e-worker';

afterEach(() => {
  jest.restoreAllMocks();
  resetLlmMiddleware();
  _resetCircuits();
});

describe('hosted Maestro LLM provider', () => {
  it('preserves the Photosynthesis subject calls and a semantic session stream after a no-key hosted-worker health probe', async () => {
    jest.spyOn(console, 'warn').mockImplementation();

    // Mirror the hosted boot sequence: the health probe runs the no-key test
    // middleware before Maestro submits the subject resolver request. The
    // middleware must leave the entrypoint's external-boundary fixture intact.
    const health = await app.request('/v1/health', {}, {
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    } as never);
    expect(health.status).toBe(200);

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
