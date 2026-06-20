// ---------------------------------------------------------------------------
// Challenge Round Finalize Failed observer — Tests
//
// Pins:
//   1. The handler is registered as the listener for
//      app/challenge-round.finalize.failed (closes the orphan-dispatch gap:
//      session-exchange.ts safeSends this event on a terminal post-claim write
//      failure, so it MUST have a registered handler).
//   2. It is included in the exported functions array.
//   3. It escalates via captureException with the failure context and emits an
//      error-level structured log, returning the logged + retry-deferred shape.
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock(
  '../../services/sentry' /* gc1-allow: observer test asserts captureException escalation on terminal write failure */,
  () => {
    const actual = jest.requireActual(
      '../../services/sentry',
    ) as typeof import('../../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

jest.mock(
  '../client' /* gc1-allow: observer test requires inngest client mock to expose trigger metadata */,
  () => {
    const actual = jest.requireActual(
      '../client',
    ) as typeof import('../client');
    return {
      ...actual,
      inngest: {
        createFunction: jest.fn(
          (_config: unknown, _trigger: unknown, handler: unknown) => ({
            fn: handler,
            opts: _config,
            trigger: _trigger,
          }),
        ),
        send: jest.fn().mockResolvedValue(undefined),
      },
    };
  },
);

import { challengeRoundFinalizeFailed } from './challenge-round-finalize-failed';
import { functions } from '../index';

const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

interface FailureEventData {
  profileId?: string;
  sessionId?: string;
  topicId?: string;
  markMasteryVerified?: boolean;
  error?: string;
}

async function invoke(data: FailureEventData) {
  const handler = (
    challengeRoundFinalizeFailed as unknown as {
      fn: (args: { event: { data: FailureEventData } }) => Promise<unknown>;
    }
  ).fn;
  return handler({ event: { data } });
}

/** Parse the logger's JSON output and find an error entry matching `message`. */
function findErrorEntry(
  message: string,
): { message: string; context?: Record<string, unknown> } | undefined {
  for (const call of consoleErrorSpy.mock.calls) {
    try {
      const entry = JSON.parse(call[0] as string) as {
        level: string;
        message: string;
        context?: Record<string, unknown>;
      };
      if (entry.level === 'error' && entry.message === message) return entry;
    } catch {
      // not a JSON log entry — skip
    }
  }
  return undefined;
}

const VALID_PAYLOAD: FailureEventData = {
  profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  topicId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  markMasteryVerified: true,
  error: 'deepening write failed after claim committed',
};

describe('challengeRoundFinalizeFailed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy.mockClear();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('is registered as the listener for app/challenge-round.finalize.failed', () => {
    const trigger = (
      challengeRoundFinalizeFailed as unknown as { trigger: unknown }
    ).trigger;
    expect(trigger).toEqual({ event: 'app/challenge-round.finalize.failed' });
  });

  it('is included in the exported functions array (no orphan dispatch)', () => {
    expect(functions).toContain(challengeRoundFinalizeFailed);
  });

  it('returns logged status with session metadata and retry-deferred marker', async () => {
    const result = await invoke(VALID_PAYLOAD);

    expect(result).toEqual({
      status: 'logged',
      sessionId: VALID_PAYLOAD.sessionId,
      topicId: VALID_PAYLOAD.topicId,
      retryDeferred: 'pending_challenge_round_finalize_retry_strategy',
    });
  });

  it('escalates the terminal write failure via captureException with full context', async () => {
    await invoke(VALID_PAYLOAD);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'challenge round finalize failed' }),
      expect.objectContaining({
        profileId: VALID_PAYLOAD.profileId,
        extra: expect.objectContaining({
          surface: 'challenge-round.finalize.failed.observer',
          sessionId: VALID_PAYLOAD.sessionId,
          topicId: VALID_PAYLOAD.topicId,
          markMasteryVerified: true,
          error: VALID_PAYLOAD.error,
        }),
      }),
    );
  });

  it('emits an error-level structured log with the full failure context', async () => {
    await invoke(VALID_PAYLOAD);

    const entry = findErrorEntry('challenge-round.finalize.failed.received');
    expect(entry).toBeDefined();
    expect(entry!.context).toMatchObject({
      profileId: VALID_PAYLOAD.profileId,
      sessionId: VALID_PAYLOAD.sessionId,
      topicId: VALID_PAYLOAD.topicId,
      markMasteryVerified: true,
      error: VALID_PAYLOAD.error,
    });
  });

  it('degrades missing fields to "unknown" without throwing', async () => {
    const result = await invoke({});

    expect(result).toEqual({
      status: 'logged',
      sessionId: null,
      topicId: null,
      retryDeferred: 'pending_challenge_round_finalize_retry_strategy',
    });
    const entry = findErrorEntry('challenge-round.finalize.failed.received');
    expect(entry).toBeDefined();
    expect(entry!.context).toMatchObject({
      profileId: 'unknown',
      sessionId: 'unknown',
      topicId: 'unknown',
      error: 'unknown',
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
