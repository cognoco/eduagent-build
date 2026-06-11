// ---------------------------------------------------------------------------
// Auto-file Session — dedicated app/session.auto_file_requested lifecycle
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();
const mockClaimSessionForAutoFiling = jest.fn();
const mockMarkSessionAutoFiled = jest.fn();
const mockMarkSessionAutoFilingFailed = jest.fn();
const mockGetSessionTranscript = jest.fn();
const mockBuildLibraryIndex = jest.fn();
const mockFileToLibrary = jest.fn();
const mockResolveFilingResult = jest.fn();
const mockDeleteTopicIfSafe = jest.fn();
const mockRouteAndCall = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockCaptureException = jest.fn();
const mockWriteActivityMoment = jest.fn();

jest.mock('../helpers' /* gc1-allow: Inngest step DB boundary */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

jest.mock('../../services/session' /* gc1-allow: service boundary */, () => ({
  claimSessionForAutoFiling: (...args: unknown[]) =>
    mockClaimSessionForAutoFiling(...args),
  markSessionAutoFiled: (...args: unknown[]) =>
    mockMarkSessionAutoFiled(...args),
  markSessionAutoFilingFailed: (...args: unknown[]) =>
    mockMarkSessionAutoFilingFailed(...args),
  getSessionTranscript: (...args: unknown[]) =>
    mockGetSessionTranscript(...args),
}));

jest.mock('../../services/filing' /* gc1-allow: LLM filing boundary */, () => ({
  buildLibraryIndex: (...args: unknown[]) => mockBuildLibraryIndex(...args),
  fileToLibrary: (...args: unknown[]) => mockFileToLibrary(...args),
  resolveFilingResult: (...args: unknown[]) => mockResolveFilingResult(...args),
}));

jest.mock(
  '../../services/curriculum' /* gc1-allow: cleanup boundary */,
  () => ({
    deleteTopicIfSafe: (...args: unknown[]) => mockDeleteTopicIfSafe(...args),
  }),
);

jest.mock('../../services/llm' /* gc1-allow: LLM router boundary */, () => ({
  routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
}));

jest.mock(
  '../../services/activity-ledger' /* gc1-allow: non-core ledger writer boundary */,
  () => ({
    writeActivityMoment: (...args: unknown[]) =>
      mockWriteActivityMoment(...args),
  }),
);

jest.mock(
  '../../services/logger' /* gc1-allow: logger observability boundary */,
  () => ({
    createLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: (...args: unknown[]) => mockLoggerError(...args),
    }),
  }),
);

jest.mock(
  '../../services/sentry' /* gc1-allow: Sentry observability boundary */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import type { InngestStepSendEventCall } from '../../test-utils/inngest-step-runner';
import { FILING_CONFIG } from '../../config/filing';
import { freeformFilingRetry } from './freeform-filing';
import { autoFileSession } from './auto-file-session';

const profileId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const db = { kind: 'db' };

function eventData(overrides: Record<string, unknown> = {}) {
  return {
    profileId,
    sessionId,
    requestedAt: '2026-05-25T10:00:00.000Z',
    reason: 'freeform_session_closed',
    dispatchId: 'auto-file-session-test',
    ...overrides,
  };
}

async function execute(
  overrides: Record<string, unknown> = {},
): Promise<{ result: unknown; sendEventCalls: InngestStepSendEventCall[] }> {
  const { step, sendEventCalls } = createInngestStepRunner();
  const handler = (autoFileSession as any).fn;
  const result = await handler({
    event: {
      name: 'app/session.auto_file_requested',
      data: eventData(overrides),
    },
    step,
  });

  return { result, sendEventCalls };
}

describe('autoFileSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(db);
    mockClaimSessionForAutoFiling.mockResolvedValue({
      id: sessionId,
      filingRetryCount: 1,
    });
    mockGetSessionTranscript.mockResolvedValue({
      archived: false,
      exchanges: [
        { role: 'user', content: 'What is gravity?' },
        { role: 'assistant', content: 'Gravity attracts masses.' },
      ],
    });
    mockBuildLibraryIndex.mockResolvedValue({ shelves: [] });
    mockFileToLibrary.mockResolvedValue({
      shelf: { name: 'Science' },
      book: { name: 'Physics', emoji: 'P', description: 'Physics basics' },
      chapter: { name: 'Forces' },
      topic: { title: 'Gravity', description: 'Attraction between masses' },
    });
    mockResolveFilingResult.mockResolvedValue({
      shelfId: '00000000-0000-4000-8000-000000000009',
      shelfName: 'Science',
      bookId: '00000000-0000-4000-8000-000000000010',
      bookName: 'Physics',
      chapter: 'Forces',
      topicId: '00000000-0000-4000-8000-000000000011',
      topicTitle: 'Gravity',
      isNew: { shelf: false, book: false, chapter: false },
    });
    mockMarkSessionAutoFiled.mockResolvedValue(true);
    mockMarkSessionAutoFilingFailed.mockResolvedValue(true);
    mockDeleteTopicIfSafe.mockResolvedValue({ deleted: true });
    mockWriteActivityMoment.mockResolvedValue(undefined);
  });

  it('registers the dedicated auto-file handler and leaves legacy retry on app/filing.retry', () => {
    expect((autoFileSession as any).opts.id).toBe('auto-file-session');
    expect((autoFileSession as any).opts.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/session.auto_file_requested' }),
      ]),
    );

    expect((freeformFilingRetry as any).opts.id).toBe('freeform-filing-retry');
    expect((freeformFilingRetry as any).opts.triggers).toEqual([
      expect.objectContaining({ event: 'app/filing.retry' }),
    ]);
  });

  it('claims, files with session_filing, finalizes with a guarded update, and emits filing.completed', async () => {
    const { result, sendEventCalls } = await execute();

    expect(mockClaimSessionForAutoFiling).toHaveBeenCalledWith(
      db,
      profileId,
      sessionId,
    );
    expect(mockFileToLibrary).toHaveBeenCalledWith(
      {
        sessionTranscript:
          'Learner: What is gravity?\nTutor: Gravity attracts masses.',
        sessionMode: 'freeform',
      },
      { shelves: [] },
      expect.any(Function),
    );
    expect(mockResolveFilingResult).toHaveBeenCalledWith(db, {
      profileId,
      sessionId,
      filedFrom: 'session_filing',
      filingResponse: expect.objectContaining({
        topic: expect.objectContaining({ title: 'Gravity' }),
      }),
    });
    expect(mockMarkSessionAutoFiled).toHaveBeenCalledWith(
      db,
      profileId,
      sessionId,
      '00000000-0000-4000-8000-000000000011',
    );
    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notify-filing-completed',
          payload: expect.objectContaining({
            name: 'app/filing.completed',
            data: expect.objectContaining({
              bookId: '00000000-0000-4000-8000-000000000010',
              topicTitle: 'Gravity',
              profileId,
              sessionId,
            }),
          }),
        }),
      ]),
    );
    expect(result).toMatchObject({ status: 'completed' });
  });

  it('writes a best-effort ledger moment after filing finalizes', async () => {
    await execute();

    expect(mockWriteActivityMoment).toHaveBeenCalledWith({
      db,
      profileId,
      actorJob: 'auto-file-session',
      kind: 'session_filed',
      templateKey: 'ledger.session_filed.default',
      params: {
        topicTitle: 'Gravity',
        subjectId: '00000000-0000-4000-8000-000000000009',
        bookId: '00000000-0000-4000-8000-000000000010',
        topicId: '00000000-0000-4000-8000-000000000011',
      },
      visibility: 'self',
    });
    const filingFinalizedOrder =
      mockMarkSessionAutoFiled.mock.invocationCallOrder[0]!;
    const ledgerWrittenOrder =
      mockWriteActivityMoment.mock.invocationCallOrder[0]!;
    expect(filingFinalizedOrder).toBeLessThan(ledgerWrittenOrder);
  });

  it('does not fail the filing function when the ledger writer throws', async () => {
    mockWriteActivityMoment.mockRejectedValue(new Error('ledger unavailable'));

    const { result } = await execute();

    expect(result).toMatchObject({ status: 'completed' });
    expect(mockMarkSessionAutoFiled).toHaveBeenCalled();
  });

  it('exits before LLM work when the claim matches 0 rows', async () => {
    mockClaimSessionForAutoFiling.mockResolvedValue(undefined);

    const { result, sendEventCalls } = await execute();

    expect(result).toMatchObject({ status: 'skipped', reason: 'claim_lost' });
    expect(mockBuildLibraryIndex).not.toHaveBeenCalled();
    expect(mockFileToLibrary).not.toHaveBeenCalled();
    expect(mockResolveFilingResult).not.toHaveBeenCalled();
    expect(sendEventCalls).toHaveLength(0);
  });

  it('cleans up the resolved topic when the final guarded update loses the race', async () => {
    mockMarkSessionAutoFiled.mockResolvedValue(false);

    const { result, sendEventCalls } = await execute();

    expect(mockDeleteTopicIfSafe).toHaveBeenCalledWith(
      db,
      profileId,
      sessionId,
      '00000000-0000-4000-8000-000000000011',
    );
    expect(sendEventCalls).toHaveLength(0);
    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'final_update_lost',
    });
  });

  it('marks filing_failed without calling the LLM when the post-claim retry count exceeds the cap', async () => {
    mockClaimSessionForAutoFiling.mockResolvedValue({
      id: sessionId,
      filingRetryCount: FILING_CONFIG.maxRetries + 1,
    });

    const { result } = await execute();

    expect(mockMarkSessionAutoFilingFailed).toHaveBeenCalledWith(
      db,
      profileId,
      sessionId,
    );
    expect(mockBuildLibraryIndex).not.toHaveBeenCalled();
    expect(mockFileToLibrary).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'failed', reason: 'retry_cap' });
  });

  it('marks filing_failed from onFailure after Inngest exhausts handler retries', async () => {
    const onFailure = (autoFileSession as any).opts.onFailure as (args: {
      event: { data: { event: { data: ReturnType<typeof eventData> } } };
      error: Error;
    }) => Promise<unknown>;

    const result = await onFailure({
      event: { data: { event: { data: eventData() } } },
      error: new Error('resolver unavailable'),
    });

    expect(mockMarkSessionAutoFilingFailed).toHaveBeenCalledWith(
      db,
      profileId,
      sessionId,
    );
    expect(mockLoggerError).toHaveBeenCalledWith(
      'auto_file_session.terminal_failure',
      expect.objectContaining({
        profileId,
        sessionId,
        dispatchId: 'auto-file-session-test',
        reason: 'handler_retries_exhausted',
      }),
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        profileId,
        extra: expect.objectContaining({
          site: 'autoFileSession.onFailure',
          sessionId,
          dispatchId: 'auto-file-session-test',
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'failed' });
  });
});
