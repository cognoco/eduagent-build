// ---------------------------------------------------------------------------
// Webhook Signature-Failure Escalator — Unit Tests
//
// Covers both the factory (createSignatureFailureEscalator) and the
// pre-built Stripe escalator singleton (stripeSignatureFailureEscalator).
//
// RED-GREEN regression evidence:
//   RED: comment out the captureException call inside createSignatureFailureEscalator
//        and all "fires exactly one escalation" assertions fail.
//   GREEN: with the implementation in place, all assertions pass.
// ---------------------------------------------------------------------------

jest.mock(
  '../sentry' /* gc1-allow: captureException makes a real Sentry API call; the
    real Sentry SDK is not wired in this unit test. The mock is the only way to
    observe escalation calls without a live Sentry DSN. */,
  () => {
    const actual = jest.requireActual(
      '../sentry',
    ) as typeof import('../sentry');
    return {
      ...actual,
      captureException: jest.fn(),
    };
  },
);

import { captureException } from '../sentry';
import {
  createSignatureFailureEscalator,
  stripeSignatureFailureEscalator,
  SIGNATURE_FAILURE_THRESHOLD,
  SIGNATURE_FAILURE_WINDOW_MS,
} from './signature-failure-escalator';

beforeEach(() => {
  jest.clearAllMocks();
  stripeSignatureFailureEscalator.__resetForTesting();
});

describe('signature-failure escalator', () => {
  it('does not escalate for a single isolated failure', () => {
    stripeSignatureFailureEscalator.record(Date.now());

    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not escalate for failures below the threshold', () => {
    const now = Date.now();
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD - 1; i++) {
      stripeSignatureFailureEscalator.record(now + i * 100);
    }

    expect(captureException).not.toHaveBeenCalled();
  });

  it('fires exactly one escalation when threshold failures occur within the window [WI-646 regression]', () => {
    // RED evidence: commenting out captureException inside createSignatureFailureEscalator
    // makes this assertion fail.
    const now = Date.now();
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      stripeSignatureFailureEscalator.record(now + i * 100);
    }

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Stripe webhook'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'stripe.webhook.sustained_signature_failure',
          threshold: SIGNATURE_FAILURE_THRESHOLD,
          windowMs: SIGNATURE_FAILURE_WINDOW_MS,
        }),
      }),
    );
  });

  it('fires at most one escalation even when N > threshold failures occur in the same window [WI-646 regression]', () => {
    const now = Date.now();
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD * 3; i++) {
      stripeSignatureFailureEscalator.record(now + i * 100);
    }

    // Exactly one escalation per window, not per failure.
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('fires again once the window expires after a prior escalation', () => {
    // First burst — fires one escalation.
    const now = Date.now();
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      stripeSignatureFailureEscalator.record(now + i * 100);
    }
    expect(captureException).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    // Second burst starting after the window has fully expired — the in-window
    // timestamps from the first burst are all evicted, escalationFired resets,
    // and the new burst can escalate once more.
    const afterWindow = now + SIGNATURE_FAILURE_WINDOW_MS + 1000;
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      stripeSignatureFailureEscalator.record(afterWindow + i * 100);
    }
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('does not count failures outside the window toward the threshold', () => {
    const now = Date.now();
    // THRESHOLD - 1 failures just inside the window.
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD - 1; i++) {
      stripeSignatureFailureEscalator.record(now + i * 100);
    }
    // One failure outside the window — all prior timestamps will be evicted on
    // this call (they are older than WINDOW_MS relative to this timestamp).
    const outside = now + SIGNATURE_FAILURE_WINDOW_MS + 1;
    stripeSignatureFailureEscalator.record(outside);

    // All prior timestamps evicted; count = 1, below threshold.
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not leak signature or secret material into the escalation', () => {
    const now = Date.now();
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      stripeSignatureFailureEscalator.record(now + i * 100);
    }

    expect(captureException).toHaveBeenCalledTimes(1);
    const [, ctx] = (captureException as jest.Mock).mock.calls[0] as [
      unknown,
      { extra: Record<string, unknown> },
    ];
    const extraKeys = Object.keys(ctx.extra);
    // None of the extra fields should contain the word 'secret', 'signature',
    // 'key', or 'token' — only operational metadata.
    const leaked = extraKeys.filter((k) =>
      /secret|signature|key|token/i.test(k),
    );
    expect(leaked).toEqual([]);
  });

  it('swallows internal errors and never throws', () => {
    // Simulate captureException throwing — the escalator must not propagate it.
    (captureException as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Sentry SDK crashed');
    });

    const now = Date.now();
    expect(() => {
      for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
        stripeSignatureFailureEscalator.record(now + i * 100);
      }
    }).not.toThrow();
  });

  it('fires exactly once for a continuous failure stream (one alert per episode, not per window)', () => {
    // Under a *continuous* stream (failures every 60s against a 5-min window)
    // the window never drains to zero, so escalationFired stays true for the
    // entire episode. This is intentional: one alert per misconfiguration
    // incident, not one alert per window slice.
    const now = Date.now();
    const STEP_MS = 60_000; // one failure per minute
    const TOTAL_FAILURES = SIGNATURE_FAILURE_THRESHOLD * 10; // well above threshold, spread over ~10 min
    for (let i = 0; i < TOTAL_FAILURES; i++) {
      stripeSignatureFailureEscalator.record(now + i * STEP_MS);
    }
    // Must not escalate more than once even though we crossed multiple
    // window boundaries' worth of elapsed time.
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe('createSignatureFailureEscalator — factory isolation', () => {
  it('creates independent escalators with isolated state', () => {
    const escalatorA = createSignatureFailureEscalator(
      'test.context.a',
      'Test A error',
    );
    const escalatorB = createSignatureFailureEscalator(
      'test.context.b',
      'Test B error',
    );

    const now = Date.now();
    // Flood only escalator A to threshold.
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      escalatorA.record(now + i * 100);
    }

    // A should have fired; B should not.
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, ctx] = (captureException as jest.Mock).mock.calls[0] as [
      unknown,
      { extra: { context: string } },
    ];
    expect(ctx.extra.context).toBe('test.context.a');

    // Adding one failure to B does not escalate B.
    escalatorB.record(now + 1000);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe('resendSignatureFailureEscalator — pre-built singleton context', () => {
  it('escalates with the Resend-specific Sentry context key', () => {
    const { resendSignatureFailureEscalator } = jest.requireActual<
      typeof import('./signature-failure-escalator')
    >('./signature-failure-escalator');
    // Use a fresh escalator to avoid cross-test contamination; we only need
    // to verify the context string written to the Sentry extra bag.
    const now = Date.now();
    for (let i = 0; i < SIGNATURE_FAILURE_THRESHOLD; i++) {
      resendSignatureFailureEscalator.record(now + i * 100);
    }

    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Resend webhook'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'resend.webhook.sustained_signature_failure',
        }),
      }),
    );
  });
});
