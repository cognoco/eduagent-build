const mockSentryScope = {
  setExtra: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
};
const mockSentryCaptureException = jest.fn();

jest.mock('@sentry/cloudflare', () => ({
  withScope: (callback: (scope: typeof mockSentryScope) => void) =>
    callback(mockSentryScope),
  captureException: (...args: unknown[]) => mockSentryCaptureException(...args),
}));

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { filingTimedOutObserve } from './filing-timed-out-observe';
import { graduationNarration } from './graduation-narration';
import { supportershipRevocation } from './supportership-revocation';

const consoleWarnSpy = jest
  .spyOn(console, 'warn')
  .mockImplementation(() => undefined);

function handlerFor<TArgs extends object>(inngestFunction: unknown) {
  return ((inngestFunction as { fn?: unknown }).fn ?? inngestFunction) as (
    args: TArgs,
  ) => Promise<unknown>;
}

describe('malformed Inngest payload disposition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  it('filingTimedOutObserve returns invalid_payload without running steps', async () => {
    const { step, runCalls, sendEventCalls, waitForEventCalls } =
      createInngestStepRunner();
    const handler = handlerFor<{
      event: { data: unknown };
      step: typeof step;
    }>(filingTimedOutObserve);

    const result = await handler({
      event: { data: { sessionId: 'not-a-uuid' } },
      step,
    });

    expect(result).toMatchObject({
      status: 'invalid_payload',
      error: expect.stringContaining('Invalid'),
    });
    expect(runCalls).toHaveLength(0);
    expect(sendEventCalls).toHaveLength(0);
    expect(waitForEventCalls).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(mockSentryCaptureException).toHaveBeenCalledTimes(1);
  });

  it('graduationNarration returns invalid_payload without running steps', async () => {
    const { step, runCalls } = createInngestStepRunner();
    const handler = handlerFor<{
      event: { data: unknown };
      step: typeof step;
    }>(graduationNarration);

    const result = await handler({
      event: { data: { personId: 123 } },
      step,
    });

    expect(result).toMatchObject({
      status: 'invalid_payload',
      error: expect.stringContaining('Invalid'),
    });
    expect(runCalls).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(mockSentryCaptureException).toHaveBeenCalledTimes(1);
  });

  it('supportershipRevocation returns invalid_payload without sleeping or running steps', async () => {
    const { step, runCalls, sleepCalls } = createInngestStepRunner();
    const handler = handlerFor<{
      event: { data: unknown };
      step: typeof step;
    }>(supportershipRevocation);

    const result = await handler({
      event: { data: { supportershipId: 'not-a-uuid' } },
      step,
    });

    expect(result).toMatchObject({
      status: 'invalid_payload',
      error: expect.stringContaining('Invalid'),
    });
    expect(sleepCalls).toHaveLength(0);
    expect(runCalls).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(mockSentryCaptureException).toHaveBeenCalledTimes(1);
  });
});
