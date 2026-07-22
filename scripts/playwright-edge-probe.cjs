#!/usr/bin/env node
'use strict';

// Phase-aware runner-to-edge probe for WI-2475. This sidecar deliberately
// calls only the public health route and persists an allowlist of timing and
// routing signals. It never records request/response headers wholesale or a
// response body, so the diagnostic can be printed safely in a CI job log.

const fs = require('node:fs');
const https = require('node:https');
const { randomUUID } = require('node:crypto');

const DNS_ERROR_CODES = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ENODATA']);
const RUNNER_NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
]);
const EDGE_SECURITY_STATUSES = new Set([403, 429]);

function headerValue(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

function coloFromCfRay(cfRay) {
  if (!cfRay) return null;
  const separator = cfRay.lastIndexOf('-');
  return separator === -1 ? null : cfRay.slice(separator + 1) || null;
}

function sanitizeProbeSample(sample) {
  return {
    schemaVersion: 1,
    probeId: sample.probeId,
    startedAt: sample.startedAt,
    finishedAt: sample.finishedAt,
    durationMs: sample.durationMs,
    target: {
      origin: sample.target?.origin ?? null,
      pathname: sample.target?.pathname ?? null,
    },
    ci: {
      runId: sample.ci?.runId ?? null,
      runAttempt: sample.ci?.runAttempt ?? null,
      job: sample.ci?.job ?? null,
      runnerName: sample.ci?.runnerName ?? null,
      runnerOs: sample.ci?.runnerOs ?? null,
      runnerArch: sample.ci?.runnerArch ?? null,
    },
    dns: {
      ok: sample.dns?.ok ?? false,
      address: sample.dns?.address ?? null,
      family: sample.dns?.family ?? null,
      durationMs: sample.dns?.durationMs ?? null,
      errorCode: sample.dns?.errorCode ?? null,
    },
    tcp: {
      ok: sample.tcp?.ok ?? false,
      durationMs: sample.tcp?.durationMs ?? null,
    },
    tls: {
      ok: sample.tls?.ok ?? false,
      durationMs: sample.tls?.durationMs ?? null,
      authorized: sample.tls?.authorized ?? null,
      protocol: sample.tls?.protocol ?? null,
    },
    http: {
      status: sample.http?.status ?? null,
      durationMs: sample.http?.durationMs ?? null,
      cfRay: sample.http?.cfRay ?? null,
      colo: sample.http?.colo ?? null,
      cfMitigated: sample.http?.cfMitigated ?? null,
      server: sample.http?.server ?? null,
    },
    worker: {
      reached: sample.worker?.reached ?? false,
      deploySha: sample.worker?.deploySha ?? null,
    },
    errorCode: sample.errorCode ?? null,
  };
}

function classifyProbeSample(sample) {
  if (
    sample.worker?.reached === true &&
    sample.http?.status >= 200 &&
    sample.http?.status < 300
  ) {
    return 'worker-reached';
  }

  const errorCode = sample.dns?.errorCode ?? sample.errorCode;
  if (sample.dns?.ok === false && DNS_ERROR_CODES.has(errorCode)) {
    return 'dns';
  }

  if (
    sample.dns?.ok === true &&
    sample.tcp?.ok !== true &&
    RUNNER_NETWORK_ERROR_CODES.has(sample.errorCode)
  ) {
    return 'runner-network';
  }

  if (
    sample.tls?.ok === true &&
    sample.worker?.reached === false &&
    Boolean(sample.http?.cfRay) &&
    (sample.http?.cfMitigated === 'challenge' ||
      EDGE_SECURITY_STATUSES.has(sample.http?.status))
  ) {
    return 'cloudflare-edge-security';
  }

  return 'unresolved';
}

function summarizeSamples(samples) {
  const incidents = [];
  let openIncident = null;

  for (const sample of samples) {
    const classification = classifyProbeSample(sample);
    if (classification === 'worker-reached') {
      if (openIncident) {
        const recoveredAt = sample.startedAt;
        const classifications = [...openIncident.classifications];
        incidents.push({
          startedAt: openIncident.startedAt,
          recoveredAt,
          durationMs:
            Date.parse(recoveredAt) - Date.parse(openIncident.startedAt),
          failedSamples: openIncident.failedSamples,
          classification:
            classifications.length === 1 ? classifications[0] : 'unresolved',
          observedClassifications: classifications,
          firstFailure: openIncident.firstFailure,
          lastFailure: openIncident.lastFailure,
          recoverySample: sample,
        });
        openIncident = null;
      }
      continue;
    }

    if (!openIncident) {
      openIncident = {
        startedAt: sample.startedAt,
        lastFinishedAt: sample.finishedAt,
        failedSamples: 0,
        classifications: new Set(),
        firstFailure: sample,
        lastFailure: sample,
      };
    }
    openIncident.failedSamples += 1;
    openIncident.lastFinishedAt = sample.finishedAt;
    openIncident.lastFailure = sample;
    openIncident.classifications.add(classification);
  }

  if (openIncident) {
    const classifications = [...openIncident.classifications];
    incidents.push({
      startedAt: openIncident.startedAt,
      recoveredAt: null,
      durationMs:
        Date.parse(openIncident.lastFinishedAt) -
        Date.parse(openIncident.startedAt),
      failedSamples: openIncident.failedSamples,
      classification:
        classifications.length === 1 ? classifications[0] : 'unresolved',
      observedClassifications: classifications,
      firstFailure: openIncident.firstFailure,
      lastFailure: openIncident.lastFailure,
      recoverySample: null,
    });
  }

  return incidents;
}

function formatPhaseEvidence(sample) {
  const dns = sample.dns?.ok
    ? `ok(${sample.dns.address ?? 'address-unknown'},${sample.dns.durationMs ?? '?'}ms)`
    : `failed(${sample.dns?.errorCode ?? sample.errorCode ?? 'no-explicit-code'})`;
  const tcp = sample.tcp?.ok
    ? `ok(${sample.tcp.durationMs ?? '?'}ms)`
    : 'not-reached';
  const tls = sample.tls?.ok
    ? `ok(${sample.tls.protocol ?? 'protocol-unknown'},${sample.tls.durationMs ?? '?'}ms)`
    : 'not-reached';
  const http = sample.http?.status ?? 'no-response';
  const worker = sample.worker?.reached
    ? `reached(${sample.worker.deploySha ?? 'deploy-unknown'})`
    : 'not-reached';

  return [
    `probe=${sample.probeId}`,
    `run=${sample.ci?.runId ?? 'local'}/${sample.ci?.runAttempt ?? '-'}`,
    `runner=${sample.ci?.runnerName ?? 'local'}`,
    `dns=${dns}`,
    `tcp=${tcp}`,
    `tls=${tls}`,
    `http=${http}`,
    `cf-ray=${sample.http?.cfRay ?? 'none'}`,
    `colo=${sample.http?.colo ?? 'none'}`,
    `cf-mitigated=${sample.http?.cfMitigated ?? 'none'}`,
    `worker=${worker}`,
    `error=${sample.errorCode ?? 'none'}`,
  ].join(' ');
}

function formatIncidentSummary(incidents) {
  if (incidents.length === 0) {
    return 'Runner-to-edge phase probe: no pre-Worker incident observed.';
  }

  return incidents
    .map((incident, index) => {
      const recovery = incident.recoveredAt
        ? `recovered ${incident.recoveredAt}`
        : 'did not recover before probe stop';
      const headline = [
        `Incident ${index + 1}: ${incident.classification}`,
        `started ${incident.startedAt}`,
        recovery,
        `${(incident.durationMs / 1000).toFixed(1)}s observed`,
        `${incident.failedSamples} failed sample(s)`,
        `signals=${incident.observedClassifications.join(',')}`,
      ].join('; ');
      const evidence = [
        `first-failure: ${formatPhaseEvidence(incident.firstFailure)}`,
      ];
      if (incident.lastFailure.probeId !== incident.firstFailure.probeId) {
        evidence.push(
          `last-failure: ${formatPhaseEvidence(incident.lastFailure)}`,
        );
      }
      if (incident.recoverySample) {
        evidence.push(
          `recovery: ${formatPhaseEvidence(incident.recoverySample)}`,
        );
      }
      return [headline, ...evidence].join('\n');
    })
    .join('\n');
}

function errorWithCode(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function probeOnce(targetValue, { timeoutMs = 3_000 } = {}) {
  const target = new URL(targetValue);
  if (target.protocol !== 'https:') {
    throw new Error('runner-to-edge probe requires an https target');
  }

  const probeId = randomUUID();
  target.searchParams.set('probe_id', probeId);
  const startedAtMs = Date.now();
  const sample = {
    probeId,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: null,
    durationMs: null,
    target: { origin: target.origin, pathname: target.pathname },
    ci: {
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      job: process.env.GITHUB_JOB ?? null,
      runnerName: process.env.RUNNER_NAME ?? null,
      runnerOs: process.env.RUNNER_OS ?? null,
      runnerArch: process.env.RUNNER_ARCH ?? null,
    },
    dns: null,
    tcp: null,
    tls: null,
    http: null,
    worker: { reached: false, deploySha: null },
    errorCode: null,
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      const finishedAtMs = Date.now();
      sample.finishedAt = new Date(finishedAtMs).toISOString();
      sample.durationMs = finishedAtMs - startedAtMs;
      resolve(sanitizeProbeSample(sample));
    };

    const request = https.get(
      target,
      {
        agent: false,
        headers: {
          accept: 'application/json',
          'cache-control': 'no-cache',
          'user-agent': 'mentomate-run-smoke-phase-probe/1',
          'x-mentomate-probe-id': probeId,
        },
      },
      (response) => {
        const cfRay = headerValue(response.headers['cf-ray']);
        sample.http = {
          status: response.statusCode ?? null,
          durationMs: Date.now() - startedAtMs,
          cfRay,
          colo: coloFromCfRay(cfRay),
          cfMitigated: headerValue(response.headers['cf-mitigated']),
          server: headerValue(response.headers.server),
        };

        const chunks = [];
        let capturedBytes = 0;
        response.on('data', (chunk) => {
          if (capturedBytes >= 32_768) return;
          const buffer = Buffer.from(chunk);
          const accepted = buffer.subarray(0, 32_768 - capturedBytes);
          chunks.push(accepted);
          capturedBytes += accepted.length;
        });
        response.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (
              response.statusCode >= 200 &&
              response.statusCode < 300 &&
              body?.status === 'ok'
            ) {
              sample.worker = {
                reached: true,
                deploySha:
                  typeof body.deploySha === 'string' ? body.deploySha : null,
              };
            }
          } catch {
            // An invalid body is useful only as absence of Worker health proof.
          }
          finish();
        });
        response.on('error', (error) => {
          sample.errorCode = error.code ?? 'RESPONSE_STREAM_ERROR';
          finish();
        });
      },
    );

    request.on('socket', (socket) => {
      socket.once('lookup', (error, address, family) => {
        sample.dns = error
          ? {
              ok: false,
              address: null,
              family: null,
              durationMs: Date.now() - startedAtMs,
              errorCode: error.code ?? null,
            }
          : {
              ok: true,
              address,
              family,
              durationMs: Date.now() - startedAtMs,
              errorCode: null,
            };
      });
      socket.once('connect', () => {
        sample.tcp = { ok: true, durationMs: Date.now() - startedAtMs };
      });
      socket.once('secureConnect', () => {
        sample.tls = {
          ok: true,
          durationMs: Date.now() - startedAtMs,
          authorized: socket.authorized,
          protocol: socket.getProtocol(),
        };
      });
    });

    const timeoutHandle = setTimeout(() => {
      request.destroy(errorWithCode('phase probe timed out', 'ETIMEDOUT'));
    }, timeoutMs);
    request.on('error', (error) => {
      sample.errorCode = error.code ?? 'UNKNOWN';
      if (!sample.dns && DNS_ERROR_CODES.has(error.code)) {
        sample.dns = {
          ok: false,
          address: null,
          family: null,
          durationMs: Date.now() - startedAtMs,
          errorCode: error.code,
        };
      }
      finish();
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function watch(
  target,
  outputPath,
  { intervalMs = 5_000, timeoutMs = 3_000 } = {},
) {
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopping) {
    const sample = await probeOnce(target, { timeoutMs });
    fs.appendFileSync(outputPath, `${JSON.stringify(sample)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    if (!stopping) await delay(intervalMs);
  }
}

function readSamples(inputPath) {
  try {
    return fs
      .readFileSync(inputPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function numberOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

module.exports = {
  classifyProbeSample,
  formatIncidentSummary,
  probeOnce,
  readSamples,
  sanitizeProbeSample,
  summarizeSamples,
  watch,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0];

  Promise.resolve()
    .then(async () => {
      if (mode === '--once') {
        const target = args[1];
        if (!target) throw new Error('usage: --once <health-url>');
        console.log(
          JSON.stringify(
            await probeOnce(target, {
              timeoutMs: numberOption(args, '--timeout-ms', 3_000),
            }),
          ),
        );
        return;
      }

      if (mode === '--watch') {
        const [target, outputPath] = args.slice(1, 3);
        if (!target || !outputPath) {
          throw new Error('usage: --watch <health-url> <jsonl-output>');
        }
        await watch(target, outputPath, {
          intervalMs: numberOption(args, '--interval-ms', 5_000),
          timeoutMs: numberOption(args, '--timeout-ms', 3_000),
        });
        return;
      }

      if (mode === '--summarize') {
        const inputPath = args[1];
        if (!inputPath) throw new Error('usage: --summarize <jsonl-input>');
        const samples = readSamples(inputPath);
        const incidents = summarizeSamples(samples);
        console.log(`Runner-to-edge phase probe: ${samples.length} sample(s).`);
        console.log(formatIncidentSummary(incidents));
        return;
      }

      throw new Error(
        'usage: playwright-edge-probe.cjs --once|--watch|--summarize ...',
      );
    })
    .catch((error) => {
      console.error(`runner-to-edge phase probe failed: ${error.message}`);
      process.exitCode = 2;
    });
}
