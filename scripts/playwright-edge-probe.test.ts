import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  classifyProbeSample,
  formatIncidentSummary,
  resolveWorkerCorrelation,
  sanitizeProbeSample,
  summarizeSamples,
} from './playwright-edge-probe.cjs';

const healthySample = (startedAt: string) => ({
  schemaVersion: 1,
  probeId: 'probe-healthy',
  startedAt,
  finishedAt: startedAt,
  durationMs: 120,
  target: {
    origin: 'https://api-stg.mentomate.com',
    pathname: '/v1/health',
  },
  ci: {
    runId: '29827835935',
    runAttempt: '1',
    job: 'run-smoke',
    runnerName: 'GitHub Actions 1000003045',
    runnerOs: 'Linux',
    runnerArch: 'X64',
  },
  dns: { ok: true, address: '203.0.113.1', family: 4, durationMs: 8 },
  tcp: { ok: true, durationMs: 20 },
  tls: { ok: true, durationMs: 35, authorized: true, protocol: 'TLSv1.3' },
  http: {
    status: 200,
    durationMs: 120,
    cfRay: 'abc123-SEA',
    colo: 'SEA',
  },
  worker: { reached: true, deploySha: '0123456' },
  errorCode: null,
});

describe('[WI-2475] classifyProbeSample', () => {
  it('identifies an explicit DNS resolution failure', () => {
    const sample = {
      ...healthySample('2026-07-22T10:00:00.000Z'),
      dns: { ok: false, errorCode: 'EAI_AGAIN', durationMs: 3_000 },
      tcp: { ok: false },
      tls: { ok: false },
      http: { status: null, cfRay: null, colo: null },
      worker: { reached: false },
      errorCode: 'EAI_AGAIN',
    };

    expect(classifyProbeSample(sample)).toBe('dns');
  });

  it('identifies a runner network path failure after successful DNS', () => {
    const sample = {
      ...healthySample('2026-07-22T10:00:00.000Z'),
      // probeOnce leaves this null when the socket never reaches 'connect'.
      tcp: null,
      tls: { ok: false },
      http: { status: null, cfRay: null, colo: null },
      worker: { reached: false },
      errorCode: 'ENETUNREACH',
    };

    expect(classifyProbeSample(sample)).toBe('runner-network');
  });

  it('stays unresolved when a 403 and CF-Ray lack decisive edge or Worker proof', () => {
    const sample = {
      ...healthySample('2026-07-22T10:00:00.000Z'),
      http: {
        status: 403,
        durationMs: 90,
        cfRay: 'blocked123-SJC',
        colo: 'SJC',
        cfMitigated: null,
      },
      worker: { reached: false },
      errorCode: null,
    };

    expect(classifyProbeSample(sample)).toBe('unresolved');
  });

  it('identifies a Cloudflare challenge independently of the HTTP status', () => {
    const sample = {
      ...healthySample('2026-07-22T10:00:00.000Z'),
      http: {
        status: 200,
        durationMs: 90,
        cfRay: 'challenged123-SJC',
        colo: 'SJC',
        cfMitigated: 'challenge',
      },
      worker: { reached: false },
      errorCode: null,
    };

    expect(classifyProbeSample(sample)).toBe('cloudflare-edge-security');
  });

  it('stays unresolved when the decisive CF-Ray edge signal is absent', () => {
    const sample = {
      ...healthySample('2026-07-22T10:00:00.000Z'),
      http: {
        status: 403,
        durationMs: 90,
        cfRay: null,
        colo: null,
        cfMitigated: 'challenge',
      },
      worker: { reached: false },
      errorCode: null,
    };

    expect(classifyProbeSample(sample)).toBe('unresolved');
  });

  it('identifies a valid health response as Worker-reached', () => {
    expect(classifyProbeSample(healthySample('2026-07-22T10:00:00.000Z'))).toBe(
      'worker-reached',
    );
  });

  it('identifies a correlated Worker response even when its status is 429', () => {
    const sample = {
      ...healthySample('2026-07-22T10:00:00.000Z'),
      http: {
        status: 429,
        durationMs: 90,
        cfRay: 'worker429-SJC',
        colo: 'SJC',
        cfMitigated: null,
      },
      worker: {
        reached: true,
        correlationId: 'probe-healthy',
        deploySha: null,
      },
      errorCode: null,
    };

    expect(classifyProbeSample(sample)).toBe('worker-reached');
  });
});

describe('[WI-2475] Worker response correlation', () => {
  it('requires the echoed Worker probe ID to match the request probe ID', () => {
    expect(
      resolveWorkerCorrelation('probe-request', {
        'x-mentomate-worker-probe-id': 'probe-request',
      }),
    ).toEqual({ reached: true, correlationId: 'probe-request' });

    expect(
      resolveWorkerCorrelation('probe-request', {
        'x-mentomate-worker-probe-id': 'another-probe',
      }),
    ).toEqual({ reached: false, correlationId: 'another-probe' });
  });
});

describe('[WI-2475] sanitized phase evidence', () => {
  it('persists the allowlisted phase fields and drops response bodies and headers', () => {
    const persisted = sanitizeProbeSample({
      ...healthySample('2026-07-22T10:00:00.000Z'),
      responseBody: 'must-not-be-persisted',
      requestHeaders: { authorization: 'Bearer must-not-be-persisted' },
      responseHeaders: { 'set-cookie': 'must-not-be-persisted' },
    });
    const serialized = JSON.stringify(persisted);

    expect(persisted.http.cfRay).toBe('abc123-SEA');
    expect(persisted.worker.reached).toBe(true);
    expect(persisted.ci.runnerName).toBe('GitHub Actions 1000003045');
    expect(serialized).not.toContain('must-not-be-persisted');
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('set-cookie');
  });
});

describe('[WI-2475] incident duration summary', () => {
  it('measures an incident from the first failed sample to recovery', () => {
    const firstFailure = {
      ...healthySample('2026-07-22T10:00:00.000Z'),
      dns: { ok: false, errorCode: 'EAI_AGAIN', durationMs: 3_000 },
      tcp: { ok: false },
      tls: { ok: false },
      http: { status: null, cfRay: null, colo: null },
      worker: { reached: false },
      errorCode: 'EAI_AGAIN',
    };
    const incidents = summarizeSamples([
      firstFailure,
      {
        ...firstFailure,
        probeId: 'probe-failed-again',
        startedAt: '2026-07-22T10:00:06.000Z',
      },
      healthySample('2026-07-22T10:00:12.000Z'),
    ]);

    expect(incidents).toEqual([
      expect.objectContaining({
        classification: 'dns',
        startedAt: '2026-07-22T10:00:00.000Z',
        recoveredAt: '2026-07-22T10:00:12.000Z',
        durationMs: 12_000,
        failedSamples: 2,
      }),
    ]);
    const summary = formatIncidentSummary(incidents);
    expect(summary).toContain('12.0s');
    expect(summary).toContain('probe=probe-healthy');
    expect(summary).toContain('dns=failed(EAI_AGAIN)');
    expect(summary).toContain('worker=not-reached');
  });
});

describe('[WI-2475] run-smoke workflow probe contract', () => {
  const workflow = parseYaml(
    readFileSync(
      join(__dirname, '..', '.github', 'workflows', 'e2e-web.yml'),
      'utf8',
    ),
  ) as {
    jobs: Record<
      string,
      { steps?: Array<{ name?: string; if?: string; run?: string }> }
    >;
  };
  const steps = workflow.jobs['run-smoke'].steps ?? [];
  const stepNamed = (name: string) => steps.find((step) => step.name === name);

  it('probes continuously across both Playwright lanes and always emits a summary', () => {
    const start = stepNamed('Start runner-to-edge phase probe');
    const summarize = stepNamed(
      'Stop and summarize runner-to-edge phase probe',
    );
    const v2Index = steps.findIndex(
      (step) => step.name === 'Run V2 release Playwright gate',
    );
    const legacyIndex = steps.findIndex(
      (step) => step.name === 'Run legacy Playwright smoke (advisory)',
    );
    const startIndex = steps.indexOf(start!);
    const summarizeIndex = steps.indexOf(summarize!);

    expect(start?.run).toContain('playwright-edge-probe.cjs');
    expect(start?.run).toContain('--watch');
    expect(start?.run).toContain('--interval-ms 5000');
    expect(summarize?.if).toBe('always()');
    expect(summarize?.run).toContain('playwright-edge-probe.cjs --summarize');
    expect(startIndex).toBeLessThan(v2Index);
    expect(summarizeIndex).toBeGreaterThan(legacyIndex);
  });

  it('runs real smoke when the probe implementation or contract changes', () => {
    const changeDecision = workflow.jobs.changes.steps?.find(
      (step) => step.name === 'Decide whether to run the real smoke suite',
    );

    expect(changeDecision?.run).toContain('scripts/playwright-edge-probe*');
  });
});
