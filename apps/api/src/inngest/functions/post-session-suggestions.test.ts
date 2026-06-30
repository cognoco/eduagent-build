// ---------------------------------------------------------------------------
// post-session-suggestions Inngest function — focused tests for [BUG-639 / J-3]
//
// Verifies that malformed LLM output is caught locally (returns 'skipped'
// with reason 'invalid_json') instead of throwing out of step.run, which
// would trigger Inngest's 4x retry loop and burn additional LLM calls for
// a structurally permanent failure.
// ---------------------------------------------------------------------------

const mockRouteAndCall = jest.fn();

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
  topicTitle: 'How Photosynthesis Works',
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
});
