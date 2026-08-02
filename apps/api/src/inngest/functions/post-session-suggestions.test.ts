// ---------------------------------------------------------------------------
// post-session-suggestions Inngest function — focused tests for [BUG-639 / J-3]
//
// Verifies that malformed LLM output is caught locally (returns 'skipped'
// with reason 'invalid_json') instead of throwing out of step.run, which
// would trigger Inngest's 4x retry loop and burn additional LLM calls for
// a structurally permanent failure.
// ---------------------------------------------------------------------------

const mockRouteAndCall = jest.fn();
const mockFindOwnedCurriculumTopic = jest.fn();

jest.mock(
  '../../services/curriculum-topic-ownership' /* gc1-allow: live database ownership lookup boundary */,
  () => {
    const actual = jest.requireActual(
      '../../services/curriculum-topic-ownership',
    ) as typeof import('../../services/curriculum-topic-ownership');
    return {
      ...actual,
      findOwnedCurriculumTopic: (...args: unknown[]) =>
        mockFindOwnedCurriculumTopic(...args),
    };
  },
);

jest.mock('../../services/llm', () => {
  const actual = jest.requireActual(
    '../../services/llm',
  ) as typeof import('../../services/llm');
  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
  };
});

jest.mock('../../services/llm/sanitize', () => {
  const actual = jest.requireActual(
    '../../services/llm/sanitize',
  ) as typeof import('../../services/llm/sanitize');
  return {
    ...actual,
    sanitizeXmlValue: (s: string) => s,
  };
});

const mockDb = {
  query: {
    curriculumBooks: { findFirst: jest.fn() },
    subjects: { findFirst: jest.fn() },
    curriculumTopics: { findMany: jest.fn() },
    consentStates: { findFirst: jest.fn() },
    profiles: { findFirst: jest.fn() },
    // WI-867: isGdprProcessingAllowedV2 reads membership.findFirst first.
    // null = no org = allowed immediately (IDENTITY_V2_ENABLED=true in .env.development.local).
    membership: { findFirst: jest.fn() },
    // WI-867: getPersonLlmContext (helpers.ts:62) reads person.findFirst for birth year + language.
    person: { findFirst: jest.fn() },
  },
  select: jest.fn(),
  insert: jest.fn(),
};

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockDb,
  };
});

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { seedConsentState } from '../../test-utils/consent-seed';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
    ...mockInngestTransport.module,
  };
});

import { postSessionSuggestions } from './post-session-suggestions';

async function runHandler(eventData: Record<string, unknown>) {
  const { step } = createInngestStepRunner();
  const handler = (postSessionSuggestions as any).fn;
  return handler({ event: { data: eventData }, step });
}

afterEach(() => {
  // BUG-298: clear captured Inngest events between tests so transport
  // assertions in one test cannot bleed into the next.
  mockInngestTransport.clear();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query.curriculumBooks.findFirst.mockResolvedValue({
    id: 'book-1',
    subjectId: 'subj-1',
    title: 'Photosynthesis',
    description: null,
  });
  mockDb.query.subjects.findFirst.mockResolvedValue({
    id: 'subj-1',
    profileId: 'profile-1',
  });
  mockDb.query.curriculumTopics.findMany.mockResolvedValue([
    { title: 'Intro' },
  ]);
  mockFindOwnedCurriculumTopic.mockResolvedValue({
    topicId: 'topic-1',
    topicTitle: 'How Photosynthesis Works',
    bookId: 'book-1',
  });
  // existing-suggestions count query: select().from().where() chain
  const whereThunk = jest.fn().mockResolvedValue([{ count: 0 }]);
  mockDb.select.mockReturnValue({
    from: jest.fn().mockReturnValue({ where: whereThunk }),
  });
  // insert chain: insert().values()
  const valuesThunk = jest.fn().mockResolvedValue(undefined);
  mockDb.insert.mockReturnValue({ values: valuesThunk });
  // Default: no consent row → processing allowed (pre-consent-flow account).
  mockDb.query.consentStates.findFirst.mockResolvedValue(undefined);
  // WI-867: membership.findFirst = null → no org → isGdprProcessingAllowedV2 returns true immediately.
  mockDb.query.membership.findFirst.mockResolvedValue(null);
  // WI-867: person.findFirst = null → no person LLM context (allowed; function handles null gracefully).
  mockDb.query.person.findFirst.mockResolvedValue(null);
  // i18n Phase 1: profile lookup for conversationLanguage.
  mockDb.query.profiles.findFirst.mockResolvedValue({
    conversationLanguage: null,
  });
});

const validEventData = {
  bookId: 'book-1',
  topicId: 'topic-1',
  profileId: 'profile-1',
  sessionId: 'session-1',
};

describe('post-session-suggestions [BUG-157] function-level guards', () => {
  // Duplicate `app/filing.completed` events for the same book would burn
  // an extra LLM call before the in-step count>=2 dedup fires; idempotency
  // at the function level short-circuits the second run before any LLM
  // tokens are burned.
  it('declares idempotency on event.data.bookId', () => {
    const opts = (postSessionSuggestions as any).opts;
    expect(opts.idempotency).toBe('event.data.bookId');
  });

  it('declares concurrency keyed on event.data.profileId', () => {
    const opts = (postSessionSuggestions as any).opts;
    expect(opts.concurrency).toEqual({
      limit: 5,
      key: 'event.data.profileId',
    });
  });
});

describe('post-session-suggestions [BUG-639 / J-3]', () => {
  it('[WI-2788] accepts and skips an explicit no-topic completion without DB or LLM work', async () => {
    const result = await runHandler({
      ...validEventData,
      bookId: null,
      topicId: null,
    });

    expect(result).toEqual({ status: 'skipped', reason: 'no_topic' });
    expect(mockDb.query.curriculumBooks.findFirst).not.toHaveBeenCalled();
    expect(mockFindOwnedCurriculumTopic).not.toHaveBeenCalled();
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('[WI-2788] normalizes the legacy no-topic completion with both IDs omitted', async () => {
    const result = await runHandler({
      profileId: validEventData.profileId,
      sessionId: validEventData.sessionId,
    });

    expect(result).toEqual({ status: 'skipped', reason: 'no_topic' });
    expect(mockDb.query.curriculumBooks.findFirst).not.toHaveBeenCalled();
    expect(mockFindOwnedCurriculumTopic).not.toHaveBeenCalled();
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it.each([
    [{ bookId: 'book-1', topicId: null }],
    [{ bookId: null, topicId: 'topic-1' }],
    [{ bookId: 'book-1' }],
    [{ topicId: 'topic-1' }],
    [{ bookId: 'book-1', topicTitle: 'Legacy topic title' }],
  ])(
    '[WI-2788] normalizes and skips a mixed or legacy filing target: %o',
    async (target) => {
      const result = await runHandler({
        profileId: validEventData.profileId,
        sessionId: validEventData.sessionId,
        ...target,
      });

      expect(result).toEqual({ status: 'skipped', reason: 'no_topic' });
      expect(mockDb.query.curriculumBooks.findFirst).not.toHaveBeenCalled();
      expect(mockFindOwnedCurriculumTopic).not.toHaveBeenCalled();
      expect(mockRouteAndCall).not.toHaveBeenCalled();
    },
  );

  it('returns skipped:invalid_json when LLM emits malformed JSON (no throw, no retry)', async () => {
    mockRouteAndCall.mockResolvedValue({
      response: 'this is not JSON at all {oops',
    });

    // Must NOT throw — Inngest would retry 4x on a thrown error.
    const result = await runHandler(validEventData);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'skipped',
        reason: 'invalid_json',
      }),
    );
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns skipped:invalid_json when LLM emits empty string', async () => {
    mockRouteAndCall.mockResolvedValue({ response: '' });
    const result = await runHandler(validEventData);
    expect(result).toEqual(
      expect.objectContaining({ status: 'skipped', reason: 'invalid_json' }),
    );
  });

  it('returns skipped:invalid_json when LLM emits truncated JSON', async () => {
    mockRouteAndCall.mockResolvedValue({
      response: '{"suggestions": ["Topic A", "Topic',
    });
    const result = await runHandler(validEventData);
    expect(result).toEqual(
      expect.objectContaining({ status: 'skipped', reason: 'invalid_json' }),
    );
  });

  it('returns skipped:invalid LLM response when JSON parses but schema fails', async () => {
    mockRouteAndCall.mockResolvedValue({
      response: '{"suggestions": [123, 456]}',
    });
    const result = await runHandler(validEventData);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'skipped',
        reason: 'invalid LLM response',
      }),
    );
  });

  it('happy path: parses valid JSON and inserts suggestions', async () => {
    mockRouteAndCall.mockResolvedValue({
      response: '{"suggestions": ["Light Reactions", "Dark Reactions"]}',
    });
    const result = await runHandler(validEventData);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        suggestions: ['Light Reactions', 'Dark Reactions'],
      }),
    );
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('[WI-2737] fences every stored text field in the system prompt', async () => {
    mockDb.query.curriculumBooks.findFirst.mockResolvedValue({
      id: 'book-1',
      subjectId: 'subj-1',
      title: 'Contact book@example.com',
      description: 'i live at 12 oakwood street',
    });
    mockDb.query.curriculumTopics.findMany.mockResolvedValue([
      { title: 'Call +1 415 555 2671' },
    ]);
    mockFindOwnedCurriculumTopic.mockResolvedValue({
      topicId: 'topic-1',
      topicTitle: 'Email topic@example.com',
      bookId: 'book-1',
    });
    mockRouteAndCall.mockResolvedValue({
      response: '{"suggestions": ["Light Reactions", "Dark Reactions"]}',
    });

    await runHandler(validEventData);

    const messages = mockRouteAndCall.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0]?.content).toContain(
      '<book_title>Contact book@example.com</book_title>',
    );
    expect(messages[0]?.content).toContain(
      '<book_description>i live at 12 oakwood street</book_description>',
    );
    expect(messages[0]?.content).toContain(
      '<topic_list>Call +1 415 555 2671</topic_list>',
    );
    expect(messages[0]?.content).toContain(
      '<completed_topic>Email topic@example.com</completed_topic>',
    );
  });

  it('[WI-2788] rehydrates the completed topic and ignores a scrubbed event title', async () => {
    mockFindOwnedCurriculumTopic.mockResolvedValue({
      topicId: 'topic-1',
      topicTitle: 'Real database title',
      bookId: 'book-1',
    });
    mockRouteAndCall.mockResolvedValue({
      response: '{"suggestions": ["A", "B"]}',
    });

    await runHandler({
      ...validEventData,
      topicTitle: '[pii-scrubbed]',
    });

    expect(mockFindOwnedCurriculumTopic).toHaveBeenCalledWith(mockDb, {
      profileId: 'profile-1',
      topicId: 'topic-1',
    });
    const messages = mockRouteAndCall.mock.calls[0]?.[0] as Array<{
      content: string;
    }>;
    expect(messages[0]?.content).toContain(
      '<completed_topic>Real database title</completed_topic>',
    );
    expect(messages[0]?.content).not.toContain('[pii-scrubbed]');
  });

  it.each([
    ['missing topic', null, 'topic not found or ownership mismatch'],
    [
      'wrong book',
      { topicId: 'topic-1', topicTitle: 'Other', bookId: 'book-2' },
      'topic/book mismatch',
    ],
  ])('skips a %s without calling the LLM', async (_label, topic, reason) => {
    mockFindOwnedCurriculumTopic.mockResolvedValue(topic);

    await expect(runHandler(validEventData)).resolves.toEqual(
      expect.objectContaining({ status: 'skipped', reason }),
    );
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('strips markdown ```json fences before parsing', async () => {
    mockRouteAndCall.mockResolvedValue({
      response: '```json\n{"suggestions": ["A", "B"]}\n```',
    });
    const result = await runHandler(validEventData);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        suggestions: ['A', 'B'],
      }),
    );
  });
});

describe('post-session-suggestions [WI-116] consent re-check', () => {
  // This job runs on the Inngest endpoint, outside the HTTP consent
  // middleware. A filing event queued before GDPR consent was withdrawn (or
  // a replay) must NOT send learner curriculum data to the LLM or persist
  // derived suggestions for a profile whose consent is no longer granted.
  it.each([
    ['WITHDRAWN', 'WITHDRAWN' as const],
    ['PENDING', 'PENDING' as const],
    ['PARENTAL_CONSENT_REQUESTED', 'PCR' as const],
  ])(
    'skips without calling the LLM or inserting when GDPR consent is %s',
    async (_label, seedState) => {
      // WI-867: source reads isGdprProcessingAllowedV2 (v2, IDENTITY_V2_ENABLED=true).
      // Seed the v2 consent chain; old consentStates.findFirst is no longer consulted.
      seedConsentState(mockDb as unknown as Record<string, unknown>, {
        state: seedState,
      });
      mockRouteAndCall.mockResolvedValue({
        response: '{"suggestions": ["A", "B"]}',
      });

      const result = await runHandler(validEventData);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'skipped',
          reason: 'consent_not_granted',
        }),
      );
      expect(mockRouteAndCall).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    },
  );

  it('proceeds when GDPR consent is CONSENTED', async () => {
    // WI-867: membership.findFirst = null (default) → no org → allowed immediately.
    mockRouteAndCall.mockResolvedValue({
      response: '{"suggestions": ["A", "B"]}',
    });

    const result = await runHandler(validEventData);

    expect(result).toEqual(expect.objectContaining({ status: 'completed' }));
    expect(mockRouteAndCall).toHaveBeenCalled();
  });

  // [WI-2396] Basis-inclusive gate: switched from isGdprProcessingAllowedV2
  // (parental basis only) to isLlmExchangeConsentAllowed, which ALSO honors
  // an adult's independently-withdrawable self-consent (art6_1_a). Sequence
  // is [gdpr_parental_consent, art6_1_a-platform_use] — CONSENTED then
  // WITHDRAWN — proving the adult leg alone (parental leg passes) now blocks,
  // which isGdprProcessingAllowedV2 alone would have missed.
  it('[WI-2396] skips without calling the LLM when GDPR consent is granted but adult self-consent (art6_1_a) is withdrawn', async () => {
    seedConsentState(mockDb as unknown as Record<string, unknown>, {
      state: ['CONSENTED', 'WITHDRAWN'],
    });
    mockRouteAndCall.mockResolvedValue({
      response: '{"suggestions": ["A", "B"]}',
    });

    const result = await runHandler(validEventData);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'skipped',
        reason: 'consent_not_granted',
      }),
    );
    expect(mockRouteAndCall).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
