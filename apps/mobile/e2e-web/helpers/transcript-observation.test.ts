import type { Page, Response } from '@playwright/test';
import { observeSeededTranscript } from './transcript-observation';

const SESSION_ID = '01980421-1111-7000-8000-000000000001';
const SUBJECT_ID = '01980421-1111-7000-8000-000000000002';
const TOPIC_ID = '01980421-1111-7000-8000-000000000003';
const USER_EVENT_ID = '01980421-1111-7000-8000-000000000004';
const ASSISTANT_EVENT_ID = '01980421-1111-7000-8000-000000000005';
const USER_CONTENT = 'Why did the Romans build so many roads?';
const ASSISTANT_CONTENT =
  'They connected cities, trade, armies, and new ideas.';

const expected = {
  sessionId: SESSION_ID,
  exchanges: [
    { role: 'user' as const, content: USER_CONTENT },
    { role: 'assistant' as const, content: ASSISTANT_CONTENT },
  ],
};

function responseWith(overrides: Record<string, unknown> = {}): Response {
  const payload = {
    archived: false,
    session: {
      sessionId: SESSION_ID,
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
      sessionType: 'learning',
      inputMode: 'text',
      startedAt: '2026-07-26T10:00:00.000Z',
      exchangeCount: 1,
      milestonesReached: [],
    },
    exchanges: [
      {
        eventId: USER_EVENT_ID,
        role: 'user',
        content: USER_CONTENT,
        timestamp: '2026-07-26T10:00:00.000Z',
      },
      {
        eventId: ASSISTANT_EVENT_ID,
        role: 'assistant',
        content: ASSISTANT_CONTENT,
        timestamp: '2026-07-26T10:00:01.000Z',
      },
    ],
    ...overrides,
  };
  return {
    request: () => ({ method: () => 'GET' }),
    url: () => `https://example.test/v1/sessions/${SESSION_ID}/transcript`,
    ok: () => true,
    status: () => 200,
    json: async () => payload,
  } as unknown as Response;
}

describe('observeSeededTranscript', () => {
  it('does not pass on the former URL/input readiness boundary before transcript hydration', async () => {
    let resolveResponse!: (response: Response) => void;
    let responsePredicate!: (response: Response) => boolean;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const page = {
      waitForResponse: jest.fn((predicate: (response: Response) => boolean) => {
        responsePredicate = predicate;
        return responsePromise;
      }),
    } as unknown as Page;

    const observation = observeSeededTranscript(page, expected);
    let settled = false;
    void observation.then(() => {
      settled = true;
    });

    // The old flow could already see both URL sessionId and chat-input here.
    await Promise.resolve();
    expect(settled).toBe(false);
    const response = responseWith();
    expect(responsePredicate(response)).toBe(true);

    resolveResponse(response);
    await expect(observation).resolves.toMatchObject({
      session: { sessionId: SESSION_ID },
    });
  });

  it('reports transformed assistant content separately from transport and hydration', async () => {
    const transformed = responseWith({
      exchanges: [
        {
          eventId: USER_EVENT_ID,
          role: 'user',
          content: USER_CONTENT,
          timestamp: '2026-07-26T10:00:00.000Z',
        },
        {
          eventId: ASSISTANT_EVENT_ID,
          role: 'assistant',
          content: 'The roads moved armies.',
          timestamp: '2026-07-26T10:00:01.000Z',
        },
      ],
    });
    const page = {
      waitForResponse: jest.fn().mockResolvedValue(transformed),
    } as unknown as Page;

    await expect(observeSeededTranscript(page, expected)).rejects.toThrow(
      '[transcript:transformed-content]',
    );
  });
});
