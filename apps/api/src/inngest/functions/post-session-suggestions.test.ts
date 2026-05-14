// ---------------------------------------------------------------------------
// post-session-suggestions Inngest function — focused tests for [BUG-639 / J-3]
//
// Verifies that malformed LLM output is caught locally (returns 'skipped'
// with reason 'invalid_json') instead of throwing out of step.run, which
// would trigger Inngest's 4x retry loop and burn additional LLM calls for
// a structurally permanent failure.
// ---------------------------------------------------------------------------

const mockRouteAndCall = jest.fn();

jest.mock('../../services/llm' /* gc1-allow: LLM external boundary */, () => ({
  ...jest.requireActual('../../services/llm'),
  routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
}));

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/llm/sanitize' /* gc1-allow: LLM sanitization boundary */,
  () => ({
    ...jest.requireActual('../../services/llm/sanitize'),
    sanitizeXmlValue: (s: string) => s,
  }),
);

const mockDb = {
  query: {
    curriculumBooks: { findFirst: jest.fn() },
    subjects: { findFirst: jest.fn() },
    curriculumTopics: { findMany: jest.fn() },
  },
  select: jest.fn(),
  insert: jest.fn(),
};

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../helpers' /* gc1-allow: isolates DB connection in unit tests */,
  () => ({
    ...jest.requireActual('../helpers'),
    getStepDatabase: () => mockDb,
  }),
);

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../client'),
  ...mockInngestTransport.module,
})); // gc1-allow: inngest framework boundary

import { postSessionSuggestions } from './post-session-suggestions';

async function runHandler(eventData: Record<string, unknown>) {
  const { step } = createInngestStepRunner();
  const handler = (postSessionSuggestions as any).fn;
  return handler({ event: { data: eventData }, step });
}

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
});

const validEventData = {
  bookId: 'book-1',
  topicTitle: 'How Photosynthesis Works',
  profileId: 'profile-1',
  sessionId: 'session-1',
};

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
