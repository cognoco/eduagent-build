// ---------------------------------------------------------------------------
// Orphan Persist Failed observer — Tests
//
// Pins two behaviors:
//   1. A well-formed app/orphan.persist.failed event calls captureException
//      with the correct profileId + extra and returns { recorded: true }.
//   2. A malformed event payload logs a warn via logger and returns
//      { recorded: false } — captureException is NOT called.
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock(
  '../../services/sentry' /* gc1-allow: observer test asserts captureException escalation on schema drift */,
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

const mockLoggerWarn = jest.fn();
jest.mock(
  '../../services/logger' /* gc1-allow: observer test asserts logger.warn on invalid payload */,
  () => {
    const actual = jest.requireActual(
      '../../services/logger',
    ) as typeof import('../../services/logger');
    return {
      ...actual,
      createLogger: () => ({
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
        error: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
      }),
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

import { orphanPersistFailed } from './orphan-persist-failed';
import { functions } from '../index';

async function invoke(eventData: unknown) {
  const handler = (
    orphanPersistFailed as unknown as {
      fn: (args: { event: { data: unknown } }) => Promise<unknown>;
    }
  ).fn;
  return handler({ event: { data: eventData } });
}

const VALID_PAYLOAD = {
  profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  draftId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  route: '/api/messages/persist',
  reason: 'network_timeout',
  error: 'Failed to persist draft after 3 retries',
};

describe('orphanPersistFailed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is registered as the listener for app/orphan.persist.failed', () => {
    const trigger = (orphanPersistFailed as unknown as { trigger: unknown })
      .trigger;
    expect(trigger).toEqual({ event: 'app/orphan.persist.failed' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(orphanPersistFailed);
  });

  it('returns { recorded: true } and calls captureException with correct args on valid payload', async () => {
    const result = await invoke(VALID_PAYLOAD);

    expect(result).toEqual({ recorded: true });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'orphan persist failed' }),
      expect.objectContaining({
        profileId: VALID_PAYLOAD.profileId,
        extra: {
          draftId: VALID_PAYLOAD.draftId,
          route: VALID_PAYLOAD.route,
          reason: VALID_PAYLOAD.reason,
        },
      }),
    );
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('accepts a null reason field (nullable in schema)', async () => {
    const result = await invoke({ ...VALID_PAYLOAD, reason: null });

    expect(result).toEqual({ recorded: true });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'orphan persist failed' }),
      expect.objectContaining({
        profileId: VALID_PAYLOAD.profileId,
        extra: expect.objectContaining({ reason: null }),
      }),
    );
  });

  it('returns { recorded: false } and logs warn when a required field is missing', async () => {
    // Missing `draftId`
    const { draftId: _dropped, ...withoutDraftId } = VALID_PAYLOAD;
    const result = await invoke(withoutDraftId);

    expect(result).toEqual({ recorded: false });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'orphan.persist.failed: invalid payload',
      expect.objectContaining({ issues: expect.any(Array) }),
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('returns { recorded: false } on completely empty object {}', async () => {
    const result = await invoke({});

    expect(result).toEqual({ recorded: false });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'orphan.persist.failed: invalid payload',
      expect.objectContaining({ issues: expect.any(Array) }),
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('returns { recorded: false } when draftId is a number instead of a UUID string', async () => {
    const result = await invoke({ ...VALID_PAYLOAD, draftId: 12345 });

    expect(result).toEqual({ recorded: false });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'orphan.persist.failed: invalid payload',
      expect.objectContaining({ issues: expect.any(Array) }),
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('returns { recorded: false } when profileId is not a valid UUID', async () => {
    const result = await invoke({ ...VALID_PAYLOAD, profileId: 'not-a-uuid' });

    expect(result).toEqual({ recorded: false });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'orphan.persist.failed: invalid payload',
      expect.objectContaining({ issues: expect.any(Array) }),
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
