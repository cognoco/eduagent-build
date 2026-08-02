import {
  createOwnerJourneyPhaseDiagnostics,
  ownerEntryPhase,
} from './owner-journey-phase-diagnostics';

describe('createOwnerJourneyPhaseDiagnostics', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function captureDiagnostics() {
    const output: string[] = [];
    const diagnostics = createOwnerJourneyPhaseDiagnostics({
      emit: (line) => output.push(line),
    });
    return { diagnostics, output };
  }

  it.each([
    ['seed-request', '/v1/__test/seed', 'server-owned-seed-response'],
    ['seed-backoff', '/v1/__test/seed', 'server-owned-seed-response'],
    ['sign-in-readiness', '/mentor', 'mentor-screen'],
    [
      ownerEntryPhase('journal', 'leaf-ready'),
      '/more/notifications',
      'leaf-screen',
    ],
  ] as const)(
    'retains delayed %s timing before the outer test budget expires',
    async (phase, pathname, readinessMarker) => {
      const { diagnostics, output } = captureDiagnostics();

      diagnostics.enter({
        phase,
        attempt: 2,
        status: 503,
        url: `https://example.test${pathname}?ticket=forbidden-query`,
        readinessMarker,
      });
      await jest.advanceTimersByTimeAsync(5_000);

      expect(output).toEqual([
        `[V2 owner journey] phase=${phase} elapsedMs=0 attempt=2 statusClass=5xx pathname=${pathname} readiness=${readinessMarker}`,
        `[V2 owner journey] phase=${phase} elapsedMs=5000 attempt=2 statusClass=5xx pathname=${pathname} readiness=${readinessMarker}`,
      ]);

      diagnostics.dispose();
    },
  );

  it('never reads or emits forbidden credential material', () => {
    const { diagnostics, output } = captureDiagnostics();
    const forbidden = 'credential-sentinel-DO-NOT-EMIT';
    const update = {
      phase: 'seed-request' as const,
      url: `https://example.test/v1/__test/seed?token=${forbidden}#${forbidden}`,
      status: 201,
      token: forbidden,
      headers: { Authorization: `Bearer ${forbidden}` },
      body: { password: forbidden },
      storageState: forbidden,
      queryData: forbidden,
    };

    diagnostics.enter(update);

    expect(output).toEqual([
      '[V2 owner journey] phase=seed-request elapsedMs=0 statusClass=2xx pathname=/v1/__test/seed',
    ]);
    expect(output.join('\n')).not.toContain(forbidden);

    diagnostics.dispose();
  });

  it.each([
    'account-entry',
    'account-ready',
    'leaf-ready',
    'browser-back',
    'account-return',
    'initiating-tab-return',
  ] as const)(
    'names every serialized entry phase independently: %s',
    (phase) => {
      expect(ownerEntryPhase('mentor', phase)).toBe(`mentor-${phase}`);
      expect(ownerEntryPhase('subjects', phase)).toBe(`subjects-${phase}`);
      expect(ownerEntryPhase('journal', phase)).toBe(`journal-${phase}`);
    },
  );
});
