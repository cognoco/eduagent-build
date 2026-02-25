/**
 * Integration smoke tests — exercises the full middleware chain via app.request()
 * and the onboarding service-level flow with mocked LLM.
 *
 * Requires:
 * - Mock LLM provider (registered in setup.ts)
 * - Mock JWT verification (mocked below)
 *
 * This test validates:
 * 1. Account creation via auth middleware
 * 2. Profile creation via profiles route
 * 3. Subject creation
 * 4. Session start + message exchange + session close
 * 5. Onboarding: interview → signal extraction → curriculum generation
 */

// Mock LLM to avoid real API calls — supports interview, signal extraction, and curriculum
jest.mock('../../apps/api/src/services/llm', () => ({
  routeAndCall: jest
    .fn()
    .mockImplementation(
      async (
        messages: Array<{ role: string; content: string }>,
        _rung: number
      ) => {
        const lastMsg = messages[messages.length - 1]?.content ?? '';

        // Signal extraction
        if (lastMsg.includes('Extract signals')) {
          return {
            response:
              '{"goals": ["learn basics"], "experienceLevel": "beginner", "currentKnowledge": "none"}',
          };
        }

        // Curriculum generation
        if (lastMsg.includes('Subject:') && lastMsg.includes('Goals:')) {
          return {
            response: JSON.stringify([
              {
                title: 'Introduction',
                description: 'Getting started',
                relevance: 'core',
                estimatedMinutes: 30,
              },
              {
                title: 'Fundamentals',
                description: 'Core concepts',
                relevance: 'core',
                estimatedMinutes: 45,
              },
            ]),
          };
        }

        // Interview responses — trigger completion when user expresses interest
        if (
          lastMsg.includes('interested in learning') ||
          lastMsg.includes('I want to learn')
        ) {
          return {
            response: 'What specific topics interest you? [INTERVIEW_COMPLETE]',
          };
        }

        // Default interview response
        return { response: 'Tell me more about your learning goals.' };
      }
    ),
  routeAndStream: jest.fn(),
  registerProvider: jest.fn(),
  createMockProvider: jest.fn((name: string) => ({
    name,
    chat: jest.fn().mockResolvedValue({ response: 'mock' }),
  })),
}));

// Mock JWT verification so we don't need a real Clerk instance
import {
  jwtMock,
  databaseMock,
  inngestClientMock,
  accountMock,
  billingMock,
  settingsMock,
  configureValidJWT,
} from './mocks';

const jwtMocks = jwtMock();
configureValidJWT(jwtMocks, {
  sub: 'user_integration_test',
  email: 'integration@test.com',
});
jest.mock('../../apps/api/src/middleware/jwt', () => jwtMocks);

// Test UUIDs — valid format to pass Zod .uuid() validation
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '00000000-0000-4000-8000-000000000002';
const SESSION_ID = '00000000-0000-4000-8000-000000000003';
const SUMMARY_ID = '00000000-0000-4000-8000-000000000004';

jest.mock('../../apps/api/src/services/account', () =>
  accountMock({
    id: ACCOUNT_ID,
    clerkUserId: 'user_integration_test',
    email: 'integration@test.com',
  })
);
jest.mock('@eduagent/database', () => databaseMock());
jest.mock('../../apps/api/src/inngest/client', () => inngestClientMock());
jest.mock('../../apps/api/src/services/settings', () => settingsMock());
jest.mock('../../apps/api/src/services/billing', () => billingMock(ACCOUNT_ID));

// Mock session service for smoke test — custom return shapes needed
jest.mock('../../apps/api/src/services/session', () => ({
  startSession: jest.fn().mockResolvedValue({
    id: SESSION_ID,
    subjectId: SUBJECT_ID,
    topicId: null,
    sessionType: 'learning',
    status: 'active',
    escalationRung: 1,
    exchangeCount: 0,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: null,
  }),
  getSession: jest.fn().mockResolvedValue({
    id: SESSION_ID,
    subjectId: SUBJECT_ID,
    topicId: null,
    sessionType: 'learning',
    status: 'active',
    escalationRung: 1,
    exchangeCount: 0,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: null,
  }),
  processMessage: jest.fn().mockResolvedValue({
    response: 'Integration test response',
    escalationRung: 1,
    isUnderstandingCheck: false,
    exchangeCount: 1,
  }),
  streamMessage: jest.fn().mockImplementation(() =>
    Promise.resolve({
      stream: (async function* () {
        yield 'Integration ';
        yield 'test ';
        yield 'stream';
      })(),
      onComplete: jest.fn().mockResolvedValue({
        exchangeCount: 1,
        escalationRung: 1,
      }),
    })
  ),
  closeSession: jest.fn().mockResolvedValue({
    message: 'Session closed',
    sessionId: SESSION_ID,
  }),
  flagContent: jest.fn().mockResolvedValue({
    message: 'Content flagged for review. Thank you!',
  }),
  getSessionSummary: jest.fn().mockResolvedValue(null),
  submitSummary: jest.fn().mockResolvedValue({
    summary: {
      id: SUMMARY_ID,
      sessionId: SESSION_ID,
      content: 'Test summary',
      aiFeedback: 'Great job!',
      status: 'accepted',
    },
  }),
}));

import { app } from '../../apps/api/src/index';
import {
  processInterviewExchange,
  extractSignals,
} from '../../apps/api/src/services/interview';
import { generateCurriculum } from '../../apps/api/src/services/curriculum';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------------------
// Learning Session Lifecycle (existing)
// ---------------------------------------------------------------------------

describe('Integration: Learning Session Lifecycle', () => {
  it('start session → send message → close session', async () => {
    // 1. Start a session
    const startRes = await app.request(
      `/v1/subjects/${SUBJECT_ID}/sessions`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ subjectId: SUBJECT_ID }),
      },
      TEST_ENV
    );
    expect(startRes.status).toBe(201);
    const startBody = await startRes.json();
    expect(startBody.session.status).toBe('active');

    const sessionId = startBody.session.id;

    // 2. Send a message
    const msgRes = await app.request(
      `/v1/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ message: 'What is photosynthesis?' }),
      },
      TEST_ENV
    );
    expect(msgRes.status).toBe(200);
    const msgBody = await msgRes.json();
    expect(msgBody.response).toBeDefined();
    expect(msgBody.exchangeCount).toBe(1);

    // 3. Close the session
    const closeRes = await app.request(
      `/v1/sessions/${sessionId}/close`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({}),
      },
      TEST_ENV
    );
    expect(closeRes.status).toBe(200);
    const closeBody = await closeRes.json();
    expect(closeBody.message).toBe('Session closed');
  });

  it('streaming endpoint returns SSE events', async () => {
    const res = await app.request(
      `/v1/sessions/${SESSION_ID}/stream`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ message: 'Explain gravity' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const body = await res.text();
    expect(body).toContain('"type":"chunk"');
    expect(body).toContain('"type":"done"');
  });
});

// ---------------------------------------------------------------------------
// Onboarding Lifecycle (new — Sprint 7)
// ---------------------------------------------------------------------------

describe('Integration: Onboarding Lifecycle', () => {
  it('completes interview and extracts signals', async () => {
    const result = await processInterviewExchange(
      { subjectName: 'Mathematics', exchangeHistory: [] },
      'I am interested in learning calculus'
    );

    expect(result.isComplete).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.response).not.toContain('[INTERVIEW_COMPLETE]');
    expect(result.extractedSignals).toBeDefined();
    expect(result.extractedSignals?.goals).toContain('learn basics');
    expect(result.extractedSignals?.experienceLevel).toBe('beginner');
  });

  it('returns incomplete when interview is not done', async () => {
    const result = await processInterviewExchange(
      { subjectName: 'Mathematics', exchangeHistory: [] },
      'Hello, I just started'
    );

    expect(result.isComplete).toBe(false);
    expect(result.response).toBeDefined();
    expect(result.extractedSignals).toBeUndefined();
  });

  it('generates curriculum from interview signals', async () => {
    const topics = await generateCurriculum({
      subjectName: 'Mathematics',
      interviewSummary: 'Student wants to learn calculus basics',
      goals: ['learn basics'],
      experienceLevel: 'beginner',
    });

    expect(topics.length).toBeGreaterThanOrEqual(2);
    expect(topics[0].title).toBe('Introduction');
    expect(topics[0].relevance).toBe('core');
    expect(topics[0].estimatedMinutes).toBe(30);
    expect(topics[1].title).toBe('Fundamentals');
  });

  it('extracts structured signals from conversation', async () => {
    const signals = await extractSignals([
      { role: 'assistant', content: 'What would you like to learn?' },
      { role: 'user', content: 'I want to learn Python programming' },
    ]);

    expect(signals.goals).toBeDefined();
    expect(Array.isArray(signals.goals)).toBe(true);
    expect(signals.experienceLevel).toBeDefined();
    expect(signals.currentKnowledge).toBeDefined();
  });

  it('full flow: interview → extract → curriculum', async () => {
    // 1. Start interview exchange that triggers completion
    const interviewResult = await processInterviewExchange(
      {
        subjectName: 'Physics',
        exchangeHistory: [
          { role: 'assistant', content: 'What would you like to learn?' },
        ],
      },
      'I am interested in learning quantum mechanics'
    );

    expect(interviewResult.isComplete).toBe(true);
    expect(interviewResult.extractedSignals).toBeDefined();

    // 2. Use extracted signals to generate curriculum
    const topics = await generateCurriculum({
      subjectName: 'Physics',
      interviewSummary: 'Student wants to learn quantum mechanics',
      goals: interviewResult.extractedSignals?.goals ?? [],
      experienceLevel:
        interviewResult.extractedSignals?.experienceLevel ?? 'beginner',
    });

    expect(topics.length).toBeGreaterThanOrEqual(2);
    expect(topics[0]).toHaveProperty('title');
    expect(topics[0]).toHaveProperty('description');
    expect(topics[0]).toHaveProperty('relevance');
    expect(topics[0]).toHaveProperty('estimatedMinutes');
  });
});
