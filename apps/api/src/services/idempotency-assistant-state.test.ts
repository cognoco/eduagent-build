import type { Database } from '@eduagent/database';
import { lookupAssistantTurnState } from './idempotency-assistant-state';

const mockCaptureException = jest.fn();
const mockLoggerWarn = jest.fn();
const mockInngestSend = jest.fn();

jest.mock('./sentry', () => {
  const actual = jest.requireActual('./sentry') as typeof import('./sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    addBreadcrumb: jest.fn(),
  };
});
jest.mock('./logger', () => {
  const actual = jest.requireActual('./logger') as typeof import('./logger');
  return {
    ...actual,
    createLogger: () => ({
      info: jest.fn(),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };
});
jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  };
});

beforeEach(() => jest.clearAllMocks());

describe('lookupAssistantTurnState', () => {
  it('returns safe default when db is undefined', async () => {
    const result = await lookupAssistantTurnState({
      db: undefined,
      profileId: 'any-profile-id',
      flow: 'session',
      key: 'any-key',
    });
    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
  });

  it('returns safe default when profileId is undefined', async () => {
    const result = await lookupAssistantTurnState({
      db: {} as Database,
      profileId: undefined,
      flow: 'session',
      key: 'any-key',
    });
    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// [BUG-420] Break tests - dispatch failure is captured, not swallowed
// ---------------------------------------------------------------------------
// These run without a real DB by passing a db that throws on first use,
// so the catch branch fires deterministically.

describe('[BUG-420] lookupAssistantTurnState - safeSend on dispatch failure', () => {
  it('returns safe default, calls logger.warn, and does NOT throw when dispatch fails', async () => {
    // Arrange: inngest.send rejects so we can verify safeSend captures it
    mockInngestSend.mockRejectedValueOnce(new Error('Inngest unavailable'));

    // A db that throws to trigger the catch path
    const brokenDb = {
      select: () => {
        throw new Error('DB connection lost');
      },
    } as unknown as Database;

    // Act
    const result = await lookupAssistantTurnState({
      db: brokenDb,
      profileId: 'a1b2c3d4-e5f6-4111-8111-a1b2c3d4e5f6',
      flow: 'session',
      key: 'any-key',
    });

    // Assert - safe default returned, no throw
    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
    // captureException called for the DB error (not the dispatch failure -
    // that's inside safeSend which also captures it internally)
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'idempotency.lookupAssistantTurnState',
        }),
      }),
    );
    // logger.warn called (observable escalation present)
    expect(mockLoggerWarn).toHaveBeenCalled();
    // inngest.send was attempted (via safeSend - NOT fire-and-forget)
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/idempotency.assistant_turn_lookup_failed',
      }),
    );
  });

  it('returns safe default and emits inngest event when DB lookup fails', async () => {
    mockInngestSend.mockResolvedValueOnce(undefined);

    const brokenDb = {
      select: () => {
        throw new Error('query timed out');
      },
    } as unknown as Database;

    const result = await lookupAssistantTurnState({
      db: brokenDb,
      profileId: 'a1b2c3d4-e5f6-4111-8111-a1b2c3d4e5f6',
      flow: 'session',
      key: 'any-key',
    });

    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/idempotency.assistant_turn_lookup_failed',
        data: expect.objectContaining({ flow: 'session' }),
      }),
    );
  });
});
