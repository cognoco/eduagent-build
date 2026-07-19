import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  classifyFailure,
  decide,
  GATE_STATES,
  runCanary,
} from './playwright-staging-gate.cjs';

describe('[WI-2228] staging canary and fail-closed classification', () => {
  it.each([[502], [503], [504]])(
    'retries transient HTTP %s and reaches healthy',
    async (status) => {
      const statuses = [status, 200];
      const result = await runCanary({
        apiUrl: 'https://api-stg.example.test',
        secret: 'test-secret',
        fetchImpl: async () => ({ status: statuses.shift() }),
        random: () => 0,
      });
      expect(result.state).toBe(GATE_STATES.HEALTHY);
    },
  );

  it.each([502, 503, 504])(
    'reports unavailable after exhausting retryable HTTP %s',
    async (status) => {
      const result = await runCanary({
        apiUrl: 'https://api-stg.example.test',
        secret: 'test-secret',
        fetchImpl: async () => ({ status }),
        attempts: 3,
        random: () => 0,
      });
      expect(result.state).toBe(GATE_STATES.UNAVAILABLE);
    },
  );

  it('fails closed when the API target is transport-unreachable', async () => {
    const result = await runCanary({
      apiUrl: 'https://typo.example.test',
      secret: 'test-secret',
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
      attempts: 3,
      random: () => 0,
    });
    expect(result).toMatchObject({
      state: GATE_STATES.NOT_RUN,
      reason: 'transport',
      terminal: true,
    });
  });

  it.each([401, 403, 404, 500])(
    'fails closed on terminal HTTP %s',
    async (status) => {
      const result = await runCanary({
        apiUrl: 'https://api-stg.example.test',
        secret: 'test-secret',
        fetchImpl: async () => ({ status }),
      });
      expect(result.state).toBe(GATE_STATES.NOT_RUN);
      expect(result.terminal).toBe(true);
    },
  );

  it('does not run without the secret or with a non-HTTPS target', async () => {
    await expect(
      runCanary({ apiUrl: 'https://api-stg.example.test', secret: '' }),
    ).resolves.toMatchObject({ state: GATE_STATES.NOT_RUN });
    await expect(
      runCanary({ apiUrl: 'http://api-stg.example.test', secret: 'present' }),
    ).resolves.toMatchObject({ state: GATE_STATES.NOT_RUN });
    await expect(
      runCanary({
        apiUrl: 'https://api-stg.example.test',
        secret: 'present',
        fetchImpl: async () => ({ status: 'malformed' }),
      }),
    ).resolves.toMatchObject({
      state: GATE_STATES.NOT_RUN,
      reason: 'malformed-response',
    });
  });

  it('recognizes trace-backed 502/503/504 and transport records only', () => {
    const root = mkdtempSync(join(tmpdir(), 'wi-2228-trace-'));
    try {
      mkdirSync(join(root, 'run'), { recursive: true });
      writeFileSync(
        join(root, 'run', 'trace.trace'),
        [
          JSON.stringify({
            type: 'response',
            url: 'https://api-stg.example.test/v1/profiles',
            status: 503,
          }),
          JSON.stringify({
            type: 'requestfailed',
            url: 'https://api-stg.example.test/v1/profiles',
            errorText: 'net::ERR_CONNECTION_RESET',
          }),
          JSON.stringify({
            type: 'resource-snapshot',
            snapshot: {
              request: { url: 'https://api-stg.example.test/v1/profiles' },
              response: { status: -1 },
            },
          }),
          JSON.stringify({
            type: 'console',
            text: '502 mentioned in arbitrary prose',
          }),
        ].join('\n'),
      );
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'TypeError: fetch failed',
        }),
      ).toEqual({ kind: 'infra-signalled' });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'Unknown error while the API transport was unavailable',
        }),
      ).toEqual({ kind: 'product' });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'handles cancellation flow',
        }),
      ).toEqual({ kind: 'unknown' });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText:
            '> playwright test --config=apps/mobile/playwright.config.ts',
        }),
      ).toEqual({ kind: 'unknown' });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'Configuration error: unable to load config',
        }),
      ).toEqual({ kind: 'product' });
      for (const resultText of [
        'Invalid configuration',
        'ConfigError: invalid project definition',
        'config validation failed',
        'Error: navigation contract mismatch',
        'Error: retry banner was not rendered after API returned 503',
        'Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:19006/home',
        'Error [ERR_MODULE_NOT_FOUND]: Cannot find package',
      ]) {
        expect(
          classifyFailure({ artifactRoot: root, exitCode: 1, resultText }),
        ).toEqual({ kind: 'product' });
      }
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'TypeError: fetch failed',
        }),
      ).toEqual({ kind: 'infra-signalled' });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'ELIFECYCLE Command failed with exit code 1.',
        }),
      ).toEqual({ kind: 'unknown' });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'Error: apiRequestContext.get: ECONNRESET',
        }),
      ).toEqual({ kind: 'infra-signalled' });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'Test run cancelled',
        }),
      ).toEqual({ kind: 'product' });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'expect(received).toBe(true)',
        }),
      ).toEqual({ kind: 'product' });
      writeFileSync(
        join(root, 'run', 'trace.trace'),
        JSON.stringify({
          type: 'resource-snapshot',
          snapshot: {
            request: { url: 'https://api-stg.example.test/v1/profiles' },
            response: { status: 503 },
          },
        }),
      );
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'TypeError: fetch failed',
        }),
      ).toEqual({ kind: 'infra-signalled' });
      writeFileSync(
        join(root, 'run', 'trace.trace'),
        JSON.stringify({
          type: 'requestfailed',
          url: 'https://api-stg.example.test/v1/profiles',
          errorText: 'disconnect notice',
        }),
      );
      expect(classifyFailure({ artifactRoot: root, exitCode: 1 })).toEqual({
        kind: 'unknown',
      });
      writeFileSync(
        join(root, 'run', 'trace.trace'),
        JSON.stringify({
          type: 'response',
          url: 'https://cdn.example.test/app.js',
          status: 503,
        }),
      );
      expect(classifyFailure({ artifactRoot: root, exitCode: 1 })).toEqual({
        kind: 'unknown',
      });
      writeFileSync(
        join(root, 'run', 'trace.trace'),
        JSON.stringify({ type: 'console', text: '503 in prose' }),
      );
      expect(classifyFailure({ artifactRoot: root, exitCode: 1 })).toEqual({
        kind: 'unknown',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  (process.platform === 'win32' ? it.skip : it)(
    'classifies retryable API status from a Playwright zip archive',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'wi-2228-trace-zip-'));
      try {
        const trace = join(root, 'trace.trace');
        writeFileSync(
          trace,
          JSON.stringify({
            type: 'resource-snapshot',
            snapshot: {
              request: { url: 'https://api-stg.example.test/v1/profiles' },
              response: { status: 503 },
            },
          }),
        );
        execFileSync('zip', ['-q', 'trace.zip', 'trace.trace'], { cwd: root });
        rmSync(trace);
        expect(
          classifyFailure({
            artifactRoot: root,
            exitCode: 1,
            resultText: 'TypeError: fetch failed',
          }),
        ).toEqual({ kind: 'infra-signalled' });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  (process.platform === 'win32' ? it.skip : it)(
    'reads trace members from an archive larger than the old whole-zip cap',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'wi-2228-large-trace-zip-'));
      try {
        writeFileSync(
          join(root, 'trace.network'),
          JSON.stringify({
            type: 'resource-snapshot',
            snapshot: {
              request: { url: 'https://api-stg.example.test/v1/profiles' },
              response: { status: 503 },
            },
          }),
        );
        writeFileSync(join(root, 'resource.bin'), randomBytes(9 * 1024 * 1024));
        execFileSync(
          'zip',
          ['-q', 'trace.zip', 'trace.network', 'resource.bin'],
          {
            cwd: root,
          },
        );
        expect(statSync(join(root, 'trace.zip')).size).toBeGreaterThan(
          8 * 1024 * 1024,
        );
        expect(
          classifyFailure({
            artifactRoot: root,
            exitCode: 1,
            resultText: 'TypeError: fetch failed',
          }),
        ).toEqual({ kind: 'infra-signalled' });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  (process.platform === 'win32' ? it.skip : it)(
    'fails closed when a trace archive exceeds the cumulative member budget',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'wi-2228-member-cap-'));
      try {
        const members: string[] = [];
        for (let index = 0; index <= 64; index += 1) {
          const member = `${index}-trace.network`;
          members.push(member);
          writeFileSync(
            join(root, member),
            index === 0
              ? JSON.stringify({
                  type: 'resource-snapshot',
                  snapshot: {
                    request: {
                      url: 'https://api-stg.example.test/v1/profiles',
                    },
                    response: { status: 503 },
                  },
                })
              : '{}',
          );
        }
        execFileSync('zip', ['-q', 'trace.zip', ...members], { cwd: root });
        for (const member of members) rmSync(join(root, member));
        expect(classifyFailure({ artifactRoot: root, exitCode: 1 })).toEqual({
          kind: 'unknown',
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it('does not neutralize assertion, cancellation, or unknown failures', () => {
    const cases = [
      ['product', 'expect(received).toBe(true)', 1],
      ['cancellation', '', 130],
      ['unknown', '', 1],
    ] as const;
    for (const [kind, resultText, exitCode] of cases) {
      expect(
        decide({
          preflight: GATE_STATES.HEALTHY,
          postflight: GATE_STATES.UNAVAILABLE,
          classification: kind,
          exitCode,
        }),
      ).toBe(exitCode);
      if (kind === 'product')
        expect(
          classifyFailure({ artifactRoot: '/missing', exitCode, resultText })
            .kind,
        ).toBe('product');
    }
  });

  // Each row maps to a workflow branch: preflight-unavailable, suite success,
  // product/unknown/cancel failure, or infra-plus-postflight. `not-run` models
  // the pre-suite early exit; classifyFailure never emits it.
  it.each([
    [
      'preflight unavailable neutral',
      GATE_STATES.UNAVAILABLE,
      GATE_STATES.NOT_RUN,
      'not-run',
      0,
      0,
    ],
    [
      'preflight unavailable not-run failure neutral',
      GATE_STATES.UNAVAILABLE,
      GATE_STATES.NOT_RUN,
      'not-run',
      1,
      0,
    ],
    [
      'preflight not-run fail closed',
      GATE_STATES.NOT_RUN,
      GATE_STATES.NOT_RUN,
      'not-run',
      1,
      1,
    ],
    [
      'healthy success',
      GATE_STATES.HEALTHY,
      GATE_STATES.HEALTHY,
      'success',
      0,
      0,
    ],
    [
      'assertion fail healthy red',
      GATE_STATES.HEALTHY,
      GATE_STATES.HEALTHY,
      'product',
      1,
      1,
    ],
    [
      'assertion fail postflight unavailable red',
      GATE_STATES.HEALTHY,
      GATE_STATES.UNAVAILABLE,
      'product',
      1,
      1,
    ],
    [
      'infra signal plus unavailable neutral',
      GATE_STATES.HEALTHY,
      GATE_STATES.UNAVAILABLE,
      'infra-signalled',
      1,
      0,
    ],
    [
      'infra signal plus healthy red',
      GATE_STATES.HEALTHY,
      GATE_STATES.HEALTHY,
      'infra-signalled',
      1,
      1,
    ],
    [
      'cancellation red',
      GATE_STATES.HEALTHY,
      GATE_STATES.UNAVAILABLE,
      'cancellation',
      130,
      130,
    ],
  ])(
    '%s',
    (_name, preflight, postflight, classification, exitCode, expected) => {
      expect(decide({ preflight, postflight, classification, exitCode })).toBe(
        expected,
      );
    },
  );

  it.each([
    ['infra outage neutral', GATE_STATES.UNAVAILABLE, 'infra-signalled', 1, 0],
    ['product failure red', GATE_STATES.UNAVAILABLE, 'product', 1, 1],
  ])(
    'uses the decision module from the workflow CLI: %s',
    (_name, postflight, classification, exitCode, expected) => {
      const result = spawnSync(
        process.execPath,
        [
          join(process.cwd(), 'scripts/playwright-staging-gate.cjs'),
          '--decide',
          GATE_STATES.HEALTHY,
          postflight,
          classification,
          String(exitCode),
        ],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(expected);
      expect(result.stdout).toContain(
        `GATE_DECISION=${expected === 0 ? 'pass' : 'fail'}`,
      );
    },
  );

  it('fails closed when workflow decision state is malformed', () => {
    const result = spawnSync(
      process.execPath,
      [
        join(process.cwd(), 'scripts/playwright-staging-gate.cjs'),
        '--decide',
        GATE_STATES.HEALTHY,
        'corrupt-state',
        'infra-signalled',
        '1',
      ],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Invalid staging-gate decision input');
  });

  it('uses stdout as the classifier CLI semantic channel', () => {
    const root = mkdtempSync(join(tmpdir(), 'wi-2228-classify-cli-'));
    try {
      const resultFile = join(root, 'result.log');
      writeFileSync(
        join(root, 'trace.trace'),
        JSON.stringify({
          type: 'response',
          url: 'https://api-stg.example.test/v1/profiles',
          status: 503,
        }),
      );
      for (const [resultText, expected] of [
        ['TypeError: fetch failed', 'infra-signalled'],
        ['Error: navigation contract mismatch', 'product'],
      ]) {
        writeFileSync(resultFile, resultText);
        const result = spawnSync(
          process.execPath,
          [
            join(process.cwd(), 'scripts/playwright-staging-gate.cjs'),
            '--classify',
            root,
            '1',
            resultFile,
          ],
          { encoding: 'utf8' },
        );
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(`FAILURE_CLASS=${expected}`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
