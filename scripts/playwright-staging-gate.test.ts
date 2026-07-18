import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
          JSON.stringify({ type: 'response', status: 503 }),
          JSON.stringify({
            type: 'requestfailed',
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
      expect(classifyFailure({ artifactRoot: root, exitCode: 1 })).toEqual({
        kind: 'infra-signalled',
      });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'Unknown error while the API transport was unavailable',
        }),
      ).toEqual({ kind: 'infra-signalled' });
      expect(
        classifyFailure({
          artifactRoot: root,
          exitCode: 1,
          resultText: 'handles cancellation flow',
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
      expect(classifyFailure({ artifactRoot: root, exitCode: 1 })).toEqual({
        kind: 'infra-signalled',
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
        expect(classifyFailure({ artifactRoot: root, exitCode: 1 })).toEqual({
          kind: 'infra-signalled',
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

  // `not-run` models the workflow's pre-suite early exit; classifyFailure
  // never emits it. These rows document the shared gate contract.
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
});
