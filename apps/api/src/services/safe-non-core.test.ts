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

  // -------------------------------------------------------------------------
  // Timeout guard — telemetry must NEVER block the request path even if the
  // underlying send() hangs (downstream outage, slow network, stalled TCP).
  // -------------------------------------------------------------------------

  describe('timeout guard', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves within the timeout window when send() hangs forever', async () => {
      const send = jest.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never settles */
          }),
      );

      const result = safeSend(send, 'unit.test.hang', { profileId: 'prof-1' });

      await jest.advanceTimersByTimeAsync(2001);
      await expect(result).resolves.toBeUndefined();

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [capturedErr, capturedCtx] = mockCaptureException.mock.calls[0];
      expect(capturedErr).toBeInstanceOf(Error);
      expect((capturedErr as Error).message).toMatch(/timed out/i);
      expect(capturedCtx.profileId).toBe('prof-1');
      expect(capturedCtx.extra).toMatchObject({
        surface: 'unit.test.hang',
        kind: 'non-core-send-timeout',
        timeoutMs: 2000,
        profileId: 'prof-1',
      });
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockLoggerError.mock.calls[0][1]).toMatchObject({
        surface: 'unit.test.hang',
        timeoutMs: 2000,
      });
    });

    it('honours a custom timeoutMs', async () => {
      const send = jest.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never settles */
          }),
      );

      const result = safeSend(
        send,
        'unit.test.custom',
        { profileId: 'prof-2' },
        { timeoutMs: 50 },
      );

      await jest.advanceTimersByTimeAsync(51);
      await expect(result).resolves.toBeUndefined();

      const [, capturedCtx] = mockCaptureException.mock.calls[0];
      expect(capturedCtx.extra).toMatchObject({
        kind: 'non-core-send-timeout',
        timeoutMs: 50,
      });
    });

    it('captures a late rejection after the timeout already fired (no unhandled promise)', async () => {
      let rejectSend!: (err: Error) => void;
      const send = jest.fn().mockImplementation(
        () =>
          new Promise<void>((_, reject) => {
            rejectSend = reject;
          }),
      );

      const result = safeSend(send, 'unit.test.late', { profileId: 'prof-3' });

      await jest.advanceTimersByTimeAsync(2001);
      await expect(result).resolves.toBeUndefined();
      expect(mockCaptureException).toHaveBeenCalledTimes(1);

      const boom = new Error('inngest finally rejected');
      rejectSend(boom);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockCaptureException).toHaveBeenCalledTimes(2);
      const [lateErr, lateCtx] = mockCaptureException.mock.calls[1];
      expect(lateErr).toBe(boom);
      expect(lateCtx.extra).toMatchObject({
        surface: 'unit.test.late',
        kind: 'non-core-send-late-rejection',
        profileId: 'prof-3',
      });
    });

    it('still works on the happy path when send() resolves before the timeout', async () => {
      const send = jest.fn().mockResolvedValue('ok');
      await safeSend(send, 'unit.test.fast');
      expect(send).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('still captures an in-band rejection without crediting it as a timeout', async () => {
      const boom = new Error('immediate fail');
      const send = jest.fn().mockRejectedValue(boom);

      await safeSend(send, 'unit.test.inband.with.timer');

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [capturedErr, capturedCtx] = mockCaptureException.mock.calls[0];
      expect(capturedErr).toBe(boom);
      expect(capturedCtx.extra).toMatchObject({
        kind: 'non-core-send',
        surface: 'unit.test.inband.with.timer',
      });
    });
  });
});
