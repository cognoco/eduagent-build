// ---------------------------------------------------------------------------
// [WI-577 / W3 bundle] PII Scrub Middleware — break tests
//
// The middleware is the runtime ratchet behind the bundle AC "a known minor
// identifier never lands in the Inngest event store": even if a dispatch
// site regresses and re-introduces a denylisted raw-text key, the outgoing
// payload is scrubbed at the client boundary and the regression is escalated
// to Sentry.
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock(
  '../services/sentry', // gc1-allow: Sentry boundary
  () => {
    const actual = jest.requireActual(
      '../services/sentry',
    ) as typeof import('../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

import { PII_SCRUBBED_PLACEHOLDER } from '@eduagent/schemas';
import { scrubOutgoingEventPayloads, scrubStepOutput } from './client';

const KNOWN_MINOR_TEXT =
  'Learner: my name is Milo Janssen and I live in Drammen';

describe('scrubOutgoingEventPayloads [WI-577]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scrubs a regressed sessionTranscript field before it reaches the event store', () => {
    const { payloads } = scrubOutgoingEventPayloads([
      {
        name: 'app/filing.retry',
        data: {
          profileId: 'p-1',
          sessionId: 's-1',
          sessionTranscript: KNOWN_MINOR_TEXT,
        },
      },
    ]);

    expect(payloads[0]?.data).toEqual({
      profileId: 'p-1',
      sessionId: 's-1',
      sessionTranscript: PII_SCRUBBED_PLACEHOLDER,
    });
    expect(JSON.stringify(payloads)).not.toContain('Milo Janssen');
  });

  it('scrubs a regressed classifyInput field', () => {
    const { payloads } = scrubOutgoingEventPayloads([
      {
        name: 'app/ask.classify_silently',
        data: { sessionId: 's-1', classifyInput: KNOWN_MINOR_TEXT },
      },
    ]);

    expect(JSON.stringify(payloads)).not.toContain('Milo Janssen');
  });

  it('escalates every scrub to Sentry — a scrub firing means a regression', () => {
    scrubOutgoingEventPayloads([
      {
        name: 'app/filing.retry',
        data: { sessionTranscript: KNOWN_MINOR_TEXT },
      },
    ]);

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          site: 'inngest.piiScrubMiddleware',
          event: 'app/filing.retry',
          scrubbedPaths: ['sessionTranscript'],
        }),
      }),
    );
  });

  it('passes clean payloads through untouched (same reference) and stays silent', () => {
    const payload = {
      name: 'app/filing.completed',
      data: { profileId: 'p-1', sessionId: 's-1', topicTitle: undefined },
    };
    const { payloads } = scrubOutgoingEventPayloads([payload]);

    expect(payloads[0]).toBe(payload);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('handles payloads without data', () => {
    const payload = { name: 'app/ping' };
    const { payloads } = scrubOutgoingEventPayloads([payload]);
    expect(payloads[0]).toBe(payload);
  });
});

describe('scrubStepOutput (memoized step-state ratchet, F-075/085/086/087/088/089)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scrubs a regressed childName field before Inngest memoizes the step return', () => {
    const transformed = scrubStepOutput(
      {
        status: 'ok',
        childName: 'Milo Janssen',
        latestSessionId: 's-1',
      },
      'gather-context',
    );

    expect(transformed?.result.data).toEqual({
      status: 'ok',
      childName: PII_SCRUBBED_PLACEHOLDER,
      latestSessionId: 's-1',
    });
    expect(JSON.stringify(transformed)).not.toContain('Milo Janssen');
  });

  it('scrubs nested struggleLines / struggleTopics / childSummaries keys', () => {
    const transformed = scrubStepOutput(
      {
        prepared: {
          childSummaries: ['Milo: +2 topics'],
          struggleLines: [{ childName: 'Milo Janssen', topics: ['fractions'] }],
          struggleTopics: ['fractions'],
        },
      },
      'prepare-weekly-progress-digest',
    );

    const serialized = JSON.stringify(transformed);
    expect(serialized).not.toContain('Milo');
    expect(serialized).not.toContain('fractions');
  });

  it('escalates every scrub to Sentry with the step name', () => {
    scrubStepOutput(
      { childDisplayName: 'Milo Janssen' },
      'generate-monthly-report',
    );

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          site: 'inngest.piiScrubMiddleware.stepOutput',
          step: 'generate-monthly-report',
          scrubbedPaths: ['childDisplayName'],
        }),
      }),
    );
  });

  it('returns undefined (no mutation) for clean step returns and stays silent', () => {
    expect(
      scrubStepOutput(
        {
          status: 'prepared',
          childProfileIds: ['c-1'],
          reportWeek: '2026-06-08',
        },
        'prepare-weekly-progress-digest',
      ),
    ).toBeUndefined();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('returns undefined for null/undefined step data', () => {
    expect(scrubStepOutput(null, 'check-restoration')).toBeUndefined();
    expect(scrubStepOutput(undefined, undefined)).toBeUndefined();
  });
});
