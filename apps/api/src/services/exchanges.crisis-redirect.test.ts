// ---------------------------------------------------------------------------
// [H2/H7 — 2026-06-05 safety audit] Crisis-redirect observability.
//
// Before this fix, the prompt-level crisis redirect (learner expresses
// distress / self-harm ideation / bullying / abuse → empathize + helpline)
// fired with ZERO logging: no metric, no event, no way to answer "how many
// learners mentioned self-harm last month?". These tests pin the structured
// safety event and the envelope plumbing that feeds it.
// ---------------------------------------------------------------------------

import { parseExchangeEnvelope, emitCrisisRedirectEvent } from './exchanges';

// Inngest dispatch surface — the external Inngest boundary (a real dispatch
// here would fire a network send), kept in the sanctioned `jest.requireActual`
// + targeted-override form (spreads the real module, overrides only
// `inngest.send`; canonical pattern per archive-cleanup.test.ts). Not a GC1/GC6
// burn-down candidate: external-boundary mock, already in the target form —
// same pattern as account.test.ts.
const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  };
});

// Sentry SDK — true external boundary (bare specifier), mocked so tests can
// assert the structured operator alarm (`captureMessage`) without a live DSN.
// The real `services/sentry.ts` wrapper runs against this mock, mirroring the
// established pattern in `services/sentry.test.ts`.
const mockCaptureMessage = jest.fn();
const mockCaptureException = jest.fn();
const alarmTags: Record<string, unknown> = {};
const alarmExtras: Record<string, unknown> = {};
const mockScope = {
  setUser: jest.fn(),
  setTag: (key: string, value: unknown) => {
    alarmTags[key] = value;
  },
  setExtra: (key: string, value: unknown) => {
    alarmExtras[key] = value;
  },
};
jest.mock('@sentry/cloudflare', () => ({
  withScope: (cb: (scope: typeof mockScope) => void) => cb(mockScope),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  addBreadcrumb: jest.fn(),
}));

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockInngestSend.mockClear();
  mockCaptureMessage.mockClear();
  mockCaptureException.mockClear();
  for (const k of Object.keys(alarmTags)) delete alarmTags[k];
  for (const k of Object.keys(alarmExtras)) delete alarmExtras[k];
  // logger.warn / logger.error write JSON lines via console — spy so we can
  // assert the reliable server-side log fired (and, in the alarm-throw case,
  // that the escalation logger.error fired — the silent-recovery guard).
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

function envelope(signals: Record<string, unknown>): string {
  return JSON.stringify({
    reply:
      "I'm really sorry you're going through this. This is something to talk about with a parent, guardian, or trusted adult.",
    signals,
    confidence: 'high',
  });
}

describe('parseExchangeEnvelope — crisis_redirect plumbing', () => {
  it('maps signals.crisis_redirect true → crisisRedirect true', () => {
    const parsed = parseExchangeEnvelope(envelope({ crisis_redirect: true }));
    expect(parsed.crisisRedirect).toBe(true);
  });

  it('defaults crisisRedirect to false when signal absent', () => {
    const parsed = parseExchangeEnvelope(envelope({}));
    expect(parsed.crisisRedirect).toBe(false);
  });

  it('defaults crisisRedirect to false on envelope parse failure', () => {
    const parsed = parseExchangeEnvelope('plain prose, not an envelope');
    expect(parsed.envelopeParseFailed).toBe(true);
    expect(parsed.crisisRedirect).toBe(false);
  });
});

describe('emitCrisisRedirectEvent', () => {
  it('[BREAK] dispatches app/safety.crisis_redirect_fired via safeSend', async () => {
    // [BREAK] Without the fix: crisis redirects fired with no event at all —
    // the highest-stakes path in the app was invisible. (Reverting the
    // emitCrisisRedirectEvent call in services/exchanges.ts makes the
    // integration of this event unreachable; deleting the dispatch below
    // makes this test fail.)
    await emitCrisisRedirectEvent({
      sessionId: 'sess-123',
      profileId: 'prof-456',
      flow: 'exchange.process',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/safety.crisis_redirect_fired',
        data: expect.objectContaining({
          sessionId: 'sess-123',
          profileId: 'prof-456',
          flow: 'exchange.process',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      }),
    );
  });

  it('never includes message content in the event payload (metadata only)', async () => {
    await emitCrisisRedirectEvent({
      sessionId: 'sess-123',
      profileId: 'prof-456',
      flow: 'exchange.process',
    });

    const sent = mockInngestSend.mock.calls[0][0] as { data: object };
    const keys = Object.keys(sent.data);
    // Closed metadata key-set: adding learner text / model reply to this
    // event is a privacy regression — extend ONLY with metadata fields.
    expect(keys.sort()).toEqual(
      [
        'eventId',
        'flow',
        'model',
        'profileId',
        'provider',
        'sessionId',
        'timestamp',
      ].sort(),
    );
  });

  it('does not throw when the Inngest dispatch fails (safeSend guarantee)', async () => {
    mockInngestSend.mockRejectedValueOnce(new Error('inngest down'));

    await expect(
      emitCrisisRedirectEvent({
        sessionId: 'sess-123',
        profileId: 'prof-456',
        flow: 'exchange.process',
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// [WI-1358 — §6(b) ruling se-032, telemetry carve-out] The crisis_redirect
// firing must be observable via BOTH a reliable server-side log AND a
// structured operator alarm — never silent — while taking NO guardian-facing
// action and never shipping disclosure content into a third-party event store.
// ---------------------------------------------------------------------------
describe('emitCrisisRedirectEvent — operator alarm + telemetry hardening (WI-1358)', () => {
  const DISCLOSURE = "I'm being hurt at home and I don't know what to do";

  it('[BREAK] emits a structured Sentry operator alarm at warning level (reliable log + alarm)', async () => {
    // [BREAK] Deleting the captureMessage call in emitCrisisRedirectEvent makes
    // this fail: the highest-stakes path would fire telemetry with no operator
    // alarm — a silent-recovery violation on a safety path.
    await emitCrisisRedirectEvent({
      sessionId: 'sess-123',
      profileId: 'prof-456',
      flow: 'exchange.process',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    // Structured operator ALARM.
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'safety.crisis_redirect_fired',
      'warning',
    );
    expect(alarmTags.surface).toBe('safety.crisis_redirect');
    expect(alarmTags.flow).toBe('exchange.process');
    expect(alarmTags.profileId).toBe('prof-456');
    expect(alarmExtras.eventId).toEqual(expect.any(String));

    // Reliable server-side log (logger.warn → console.warn JSON line).
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0][0] as string;
    expect(logged).toContain('safety.crisis_redirect_fired');
    expect(logged).toContain('"event_id"');
  });

  it('correlates the log line, alarm, and telemetry event with one eventId', async () => {
    await emitCrisisRedirectEvent({
      sessionId: 'sess-123',
      profileId: 'prof-456',
      flow: 'exchange.process',
    });

    const telemetryData = mockInngestSend.mock.calls[0][0].data as {
      eventId: string;
    };
    expect(alarmExtras.eventId).toBe(telemetryData.eventId);
    const logged = warnSpy.mock.calls[0][0] as string;
    expect(logged).toContain(telemetryData.eventId);
  });

  it('NO disclosure content or raw PII in the alarm payload (event-id + pointers only)', async () => {
    await emitCrisisRedirectEvent({
      sessionId: 'sess-123',
      profileId: 'prof-456',
      flow: 'exchange.process',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    // Alarm `extra` is a closed metadata key-set — pointers only. Adding
    // disclosure text / learner message here is a privacy regression.
    expect(Object.keys(alarmExtras).sort()).toEqual(
      ['eventId', 'model', 'provider', 'sessionId', 'timestamp'].sort(),
    );

    // Belt-and-braces: the disclosure string appears in NO sink — not the
    // alarm, not the telemetry event, not the reliable log. The function is
    // never handed the disclosure, and must never reconstruct it.
    const serializedAlarm = JSON.stringify({ alarmTags, alarmExtras });
    const serializedTelemetry = JSON.stringify(mockInngestSend.mock.calls);
    const serializedLog = JSON.stringify(warnSpy.mock.calls);
    for (const sink of [serializedAlarm, serializedTelemetry, serializedLog]) {
      expect(sink).not.toContain(DISCLOSURE);
    }
    // Disclosure-bearing keys must never appear in the machine sinks (the log
    // envelope legitimately has a `message` field, so scope that check to the
    // alarm + telemetry payloads, whose key-sets are closed metadata).
    for (const sink of [serializedAlarm, serializedTelemetry]) {
      expect(sink).not.toContain('reply');
      expect(sink).not.toContain('content');
      expect(sink).not.toContain('learnerQuote');
      expect(sink).not.toContain('disclosure');
    }
  });

  it('[NEGATIVE] fires NO guardian-facing side-effect — the only dispatch is telemetry', async () => {
    await emitCrisisRedirectEvent({
      sessionId: 'sess-123',
      profileId: 'prof-456',
      flow: 'exchange.process',
    });

    // §6(b) ruling se-032: the server takes NO guardian-notification action on
    // crisis_redirect, ever (guardian-is-the-abuser failure mode). The ONLY
    // Inngest dispatch is the observability-only telemetry event; there is no
    // guardian / parent / notification / push / email dispatch on this path.
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    const dispatchedName = mockInngestSend.mock.calls[0][0].name as string;
    expect(dispatchedName).toBe('app/safety.crisis_redirect_fired');
    expect(dispatchedName).not.toMatch(
      /guardian|parent|notif|push|email|report/i,
    );

    // The Sentry sink is a warning-level operator ALARM, not a notification —
    // captureMessage is the only Sentry call; nothing routes to a recipient.
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
  });

  it('a Sentry-SDK throw does not abort the path — telemetry still publishes', async () => {
    // The three sinks are independent: if the operator-alarm SDK throws, the
    // function must still resolve AND still publish the Inngest telemetry event
    // (observability on the highest-stakes path must never be all-or-nothing).
    mockCaptureMessage.mockImplementationOnce(() => {
      throw new Error('Sentry SDK crashed');
    });

    await expect(
      emitCrisisRedirectEvent({
        sessionId: 'sess-123',
        profileId: 'prof-456',
        flow: 'exchange.process',
      }),
    ).resolves.toBeUndefined();

    // Telemetry event still fired despite the alarm throwing.
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    expect(mockInngestSend.mock.calls[0][0].name).toBe(
      'app/safety.crisis_redirect_fired',
    );

    // The alarm failure is ESCALATED (logger.error), not silently swallowed —
    // this is the silent-recovery guard on the safety path. A regression that
    // drops the catch-branch escalation must fail here.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toEqual(
      expect.stringContaining('safety.crisis_redirect_alarm_failed'),
    );
  });
});
