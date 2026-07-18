#!/usr/bin/env node
/**
 * Small, fail-closed controller for the secret-backed Playwright staging gate.
 * It deliberately consumes only Playwright-owned trace files, never arbitrary
 * console output, when deciding whether a failed suite has an infra signal.
 */
const { randomBytes } = require('node:crypto');
const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const GATE_STATES = Object.freeze({
  HEALTHY: 'healthy',
  UNAVAILABLE: 'confirmed-unavailable',
  NOT_RUN: 'not-run',
});

const RETRYABLE = new Set([502, 503, 504]);
const TRANSPORT = /(?:timed?out|timeout|network|fetch failed|socket|connection reset|connect)/i;
const HARD_FAILURE = /(?:assert(?:ion)?|expect\(|no tests? found|discovery|config(?:uration)?|cancel(?:led|lation)?|malformed)/i;
const MAX_TRACE_BYTES = 8 * 1024 * 1024;

function validatedApiUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('API target must use HTTPS');
  return url;
}

function prefix() {
  return `pw-canary-${Date.now().toString(36)}-${randomBytes(18).toString('hex')}-`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Return only a machine-readable state; never print response bodies or secrets. */
async function runCanary({ apiUrl, secret, fetchImpl = fetch, attempts = 3, timeoutMs = 7000, random = Math.random }) {
  if (!secret) return { state: GATE_STATES.NOT_RUN, reason: 'secret-missing' };
  let target;
  try {
    target = validatedApiUrl(apiUrl);
  } catch {
    return { state: GATE_STATES.NOT_RUN, reason: 'invalid-target' };
  }
  const query = new URLSearchParams({ prefix: prefix(), preserveClerkUsers: 'true' });
  const endpoint = new URL('/v1/__test/reset', target);
  endpoint.search = query.toString();
  let last = 'unknown';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'X-Test-Secret': secret, accept: 'application/json' },
        signal: controller.signal,
      });
      last = `http-${response.status}`;
      // A malformed fetch adapter or test double can reach this path even
      // though a conforming Fetch Response always exposes an integer status.
      if (!Number.isInteger(response.status)) return { state: GATE_STATES.NOT_RUN, reason: 'malformed-response', terminal: true };
      if (response.status >= 200 && response.status < 300) return { state: GATE_STATES.HEALTHY, status: response.status };
      if (response.status >= 100 && response.status <= 599 && !RETRYABLE.has(response.status)) {
        return { state: GATE_STATES.NOT_RUN, reason: last, terminal: true };
      }
    } catch (error) {
      last = error?.name === 'AbortError' ? 'timeout' : 'transport';
    } finally {
      clearTimeout(timer);
    }
    if (attempt + 1 < attempts) await sleep(100 * 2 ** attempt + Math.floor(random() * 100));
  }
  return { state: GATE_STATES.UNAVAILABLE, reason: last };
}

function traceFiles(root) {
  if (!existsSync(root)) return [];
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const info = statSync(file);
      if (info.isDirectory()) walk(file);
      else if (name.endsWith('.zip') || name.endsWith('.trace')) found.push(file);
    }
  };
  walk(root);
  return found;
}

function traceLines(file) {
  if (statSync(file).size > MAX_TRACE_BYTES) return [];
  if (file.endsWith('.trace')) return readFileSync(file, 'utf8').split('\n');
  try {
    return execFileSync('unzip', ['-p', file], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\n');
  } catch {
    return [];
  }
}

/**
 * Inspect Playwright-owned trace network records. Console prose is excluded.
 * A hard result/configuration failure wins over a later canary outage.
 */
function classifyFailure({ artifactRoot, exitCode, resultText = '' }) {
  if (exitCode === 0) return { kind: 'success' };
  if (exitCode === 130 || exitCode === 143) return { kind: 'cancellation' };
  const lines = traceFiles(artifactRoot).flatMap(traceLines);
  const networkSignal = lines.some((line) => {
    try {
      const record = JSON.parse(line);
      const status = record?.type === 'response' ? (record?.metadata?.status ?? record?.status) : record?.status;
      const snapshotUrl = record?.type === 'resource-snapshot' ? record?.snapshot?.request?.url : '';
      const snapshotStatuses = record?.type === 'resource-snapshot'
        ? [...JSON.stringify(record).matchAll(/"status":(-?\d+)/g)].map((match) => Number(match[1]))
        : [];
      const error = record?.error?.error?.message ?? record?.error?.message ?? record?.errorText;
      return RETRYABLE.has(Number(status))
        || (record?.type === 'requestfailed' && TRANSPORT.test(String(error ?? '')))
        || (snapshotUrl
          && /\/v1\//.test(snapshotUrl)
          && snapshotStatuses.some((snapshotStatus) => snapshotStatus === -1 || RETRYABLE.has(snapshotStatus)));
    } catch {
      return false;
    }
  });
  if (HARD_FAILURE.test(resultText)) return { kind: 'product' };
  return networkSignal ? { kind: 'infra-signalled' } : { kind: 'unknown' };
}

function decide({ preflight, postflight, classification, exitCode }) {
  // The workflow shell is the authoritative runtime path; this exported
  // decision function is its executable regression contract. Keep both
  // branches aligned and extend the matrix tests when the gate changes.
  // `not-run` models the workflow's pre-suite bail; classifyFailure never emits it.
  if (preflight === GATE_STATES.UNAVAILABLE && classification === 'not-run') return 0;
  if (exitCode === 0) return 0;
  if (classification === 'cancellation' || classification === 'product' || classification === 'unknown') return exitCode || 1;
  return classification === 'infra-signalled' && postflight === GATE_STATES.UNAVAILABLE ? 0 : exitCode || 1;
}

function printState(result) {
  process.stdout.write(`GATE_STATE=${result.state}\n`);
}

module.exports = { GATE_STATES, runCanary, classifyFailure, decide };

(async () => {
if (require.main === module) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === '--canary') {
    const result = await runCanary({ apiUrl: process.env.PLAYWRIGHT_API_URL, secret: process.env.TEST_SEED_SECRET });
    printState(result);
    // State is the sole control channel; callers inspect GATE_STATE and emit
    // diagnostics without losing them to set -e.
    process.exit(0);
  }
  if (mode === '--classify') {
    const resultFile = args[2];
    const resultText = resultFile && existsSync(resultFile) ? readFileSync(resultFile, 'utf8') : '';
    const result = classifyFailure({ artifactRoot: args[0] ?? 'apps/mobile/e2e-web/test-results', exitCode: Number(args[1] ?? 1), resultText });
    process.stdout.write(`FAILURE_CLASS=${result.kind}\n`);
    process.exit(result.kind === 'infra-signalled' ? 0 : 1);
  }
  process.exit(2);
}
})();
