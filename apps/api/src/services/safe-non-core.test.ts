import { safeSend } from './safe-non-core';

const mockCaptureException = jest.fn();
jest.mock('./sentry' /* gc1-allow: external error-tracker boundary */, () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const mockLoggerError = jest.fn();
jest.mock(
  './logger' /* gc1-allow: structured-logger boundary, no real I/O in tests */,
  () => ({
    createLogger: () => ({
      error: (...args: unknown[]) => mockLoggerError(...args),
    }),
  }),
);

describe('safeSend', () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
    mockLoggerError.mockReset();
  });

  it('awaits the dispatch on the happy path', async () => {
    const send = jest.fn().mockResolvedValue('ok');
    await safeSend(send, 'unit.test');
    expect(send).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('captures + logs but never throws when the dispatch rejects', async () => {
    const boom = new Error('inngest down');
    const send = jest.fn().mockRejectedValue(boom);

    await expect(
      safeSend(send, 'unit.test', {
        profileId: 'prof-1',
        sessionId: 'sess-1',
      }),
    ).resolves.toBeUndefined();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [capturedErr, capturedCtx] = mockCaptureException.mock.calls[0];
    expect(capturedErr).toBe(boom);
    // profileId MUST be at the top level so sentry.ts promotes it to a tag.
    expect(capturedCtx.profileId).toBe('prof-1');
    expect(capturedCtx.extra).toMatchObject({
      surface: 'unit.test',
      kind: 'non-core-send',
      profileId: 'prof-1',
      sessionId: 'sess-1',
    });
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError.mock.calls[0][1]).toMatchObject({
      surface: 'unit.test',
      profileId: 'prof-1',
      sessionId: 'sess-1',
    });
  });

  it('omits profileId at the top level when context has no string profileId', async () => {
    const boom = new Error('inngest down');
    const send = jest.fn().mockRejectedValue(boom);

    await safeSend(send, 'unit.test', { sessionId: 'sess-1' });

    const [, capturedCtx] = mockCaptureException.mock.calls[0];
    expect(capturedCtx.profileId).toBeUndefined();
  });
});
