import { resetLlmMiddleware } from '../middleware/llm';
import { detectSubjectType } from '../services/book-generation';
import { prepareHomework } from '../services/dictation/prepare-homework';
import { reviewDictation } from '../services/dictation/review';
import {
  applySourceAuditSafetyFallback,
  auditExchangeSources,
  classifyExchangeOutcome,
  inferObviousReliableSourceForAudit,
  streamExchange,
} from '../services/exchanges';
import { _resetCircuits } from '../services/llm';
import { resolveSubjectName } from '../services/subject-resolve';
import { evaluateSummary } from '../services/summaries';
import { sendEmail } from '../services/notifications/email';
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
  it('[WI-1864] confirms consent email delivery without a live provider key', async () => {
    await expect(
      sendEmail({
        to: 'parent@example.com',
        subject: 'Consent request',
        body: 'Hosted Maestro fixture',
        type: 'consent_request',
      }),
    ).resolves.toEqual({
      sent: true,
      messageId: 'maestro-e2e-email',
    });
  });

  it('[WI-1864] returns the release-flow recitation readiness receipt', async () => {
    const exchange = await streamExchange(
      {
        sessionId: 'maestro-recitation-session',
        profileId: 'maestro-profile',
        subjectName: 'World History',
        sessionType: 'learning',
        escalationRung: 1,
        exchangeHistory: [],
        birthYear: 2000,
        effectiveMode: 'recitation',
        inputMode: 'text',
        recitationSetup: {
          action: 'invite_to_begin',
          state: { phase: 'ready', clarificationCount: 0 },
        },
      },
      'Ozymandias',
    );
    let visibleReply = '';
    for await (const chunk of exchange.stream) visibleReply += chunk;

    expect(visibleReply).toBe(
      'Ready when you are — begin your recitation from memory.',
    );

    const rawResponse = await exchange.rawResponsePromise;
    const outcome = classifyExchangeOutcome(rawResponse, {
      sessionId: 'maestro-recitation-session',
      profileId: 'maestro-profile',
      flow: 'hosted-maestro-test',
    });
    const privateSources = inferObviousReliableSourceForAudit(
      outcome.parsed.privateSources,
      exchange.sourceEvidence,
      outcome.parsed.cleanResponse,
    );
    const sourceAudit = auditExchangeSources(
      privateSources,
      exchange.sourceEvidence,
      { envelopeParseFailed: outcome.parsed.envelopeParseFailed },
    );
    const sourceSafe = applySourceAuditSafetyFallback(
      outcome.parsed.cleanResponse,
      sourceAudit,
    );

    expect(sourceAudit.status).toBe('ok');
    expect(sourceSafe.response).toBe(visibleReply);
  });

  it('[WI-1864] returns deterministic feedback for the release recitation turn', async () => {
    const exchange = await streamExchange(
      {
        sessionId: 'maestro-recitation-feedback',
        profileId: 'maestro-profile',
        subjectName: 'World History',
        sessionType: 'learning',
        escalationRung: 1,
        exchangeHistory: [],
        birthYear: 2000,
        effectiveMode: 'recitation',
        inputMode: 'text',
        recitationSetup: {
          action: 'coach_recitation',
          state: { phase: 'ready', clarificationCount: 0 },
        },
      },
      'A remembered opening line for this test.',
    );
    let visibleReply = '';
    for await (const chunk of exchange.stream) visibleReply += chunk;

    expect(visibleReply).toBe(
      'Good recall. Keep the wording steady and continue when you are ready.',
    );

    const rawResponse = await exchange.rawResponsePromise;
    const outcome = classifyExchangeOutcome(rawResponse, {
      sessionId: 'maestro-recitation-feedback',
      profileId: 'maestro-profile',
      flow: 'hosted-maestro-test',
    });
    const privateSources = inferObviousReliableSourceForAudit(
      outcome.parsed.privateSources,
      exchange.sourceEvidence,
      outcome.parsed.cleanResponse,
    );
    const sourceAudit = auditExchangeSources(
      privateSources,
      exchange.sourceEvidence,
      { envelopeParseFailed: outcome.parsed.envelopeParseFailed },
    );
    const sourceSafe = applySourceAuditSafetyFallback(
      outcome.parsed.cleanResponse,
      sourceAudit,
    );

    expect(sourceAudit.status).toBe('ok');
    expect(sourceSafe.response).toBe(visibleReply);
  });

  it('[WI-1864] returns available feedback for the planned session-summary flow', async () => {
    await expect(
      evaluateSummary(
        'World History Topic 1',
        'A deterministic topic used by the hosted learning scenario',
        'I learned about the key concepts and how they apply in practice',
        { conversationLanguage: 'en' },
      ),
    ).resolves.toEqual({
      feedback: 'Good summary — you connected the key concepts to practice.',
      feedbackStatus: 'available',
      hasUnderstandingGaps: false,
      gapAreas: [],
      isAccepted: true,
    });
  });

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
