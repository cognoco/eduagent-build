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
const TRANSPORT =
  /(?:timed?out|timeout|network|fetch failed|socket hang up|econnrefused|econnreset|err_connection_reset|connection refused|connection reset)/i;
const RESULT_TRANSPORT =
  /^\s*Error:\s*(?:apiRequestContext|request)\.[A-Za-z]+:\s*(?:fetch failed|socket hang up|econnrefused|econnreset|err_connection_reset|connection refused|connection reset|net::err_[a-z_]+)\s+at\s+(https:\/\/\S+\/v1\/\S*)\s*$/i;
// Match standard JavaScript error-class lines (Error:, TypeError:,
// ConfigError:) while excluding identifier labels such as handleError:.
const ERROR_LINE =
  /(?:^|[\s\]])(?:[Ee]rror|[A-Z][A-Za-z0-9]*Error)(?:\s+\[[^\]]+\])?:/;
const ANSI_ESCAPE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const HARD_FAILURE =
  /(?:assert(?:ion)?|expect\(|unknown error|no tests? found|test discovery (?:error|failed)|(?:config(?:uration)?) (?:validation )?(?:error|failed|failure|invalid)|invalid (?:test )?config(?:uration)?|config(?:uration)?error|(?:failed|unable) to (?:load|resolve) (?:the )?config|test run cancel(?:led|ed)|interrupted|malformed)/i;
const MAX_TRACE_MEMBER_BYTES = 32 * 1024 * 1024;
const MAX_TRACE_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_TRACE_MEMBERS = 64;
const MAX_TRACE_INDEX_BYTES = 4 * 1024 * 1024;
const TRACE_MEMBER = /(?:^|\/)(?:\d+-)?trace\.(?:trace|network)$/;

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
async function runCanary({
  apiUrl,
  secret,
  fetchImpl = fetch,
  attempts = 3,
  timeoutMs = 7000,
  random = Math.random,
}) {
  if (!secret) return { state: GATE_STATES.NOT_RUN, reason: 'secret-missing' };
  let target;
  try {
    target = validatedApiUrl(apiUrl);
  } catch {
    return { state: GATE_STATES.NOT_RUN, reason: 'invalid-target' };
  }
  const query = new URLSearchParams({
    prefix: prefix(),
    preserveClerkUsers: 'true',
  });
  const endpoint = new URL('/v1/__test/reset', target);
  endpoint.search = query.toString();
  let last = 'unknown';
  let sawRetryableHttp = false;
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
      if (!Number.isInteger(response.status))
        return {
          state: GATE_STATES.NOT_RUN,
          reason: 'malformed-response',
          terminal: true,
        };
      if (response.status >= 200 && response.status < 300)
        return { state: GATE_STATES.HEALTHY, status: response.status };
      if (
        response.status >= 100 &&
        response.status <= 599 &&
        !RETRYABLE.has(response.status)
      ) {
        return { state: GATE_STATES.NOT_RUN, reason: last, terminal: true };
      }
      if (RETRYABLE.has(response.status)) sawRetryableHttp = true;
    } catch (error) {
      last = error?.name === 'AbortError' ? 'timeout' : 'transport';
    } finally {
      clearTimeout(timer);
    }
    if (attempt + 1 < attempts)
      await sleep(100 * 2 ** attempt + Math.floor(random() * 100));
  }
  return sawRetryableHttp
    ? { state: GATE_STATES.UNAVAILABLE, reason: last }
    : { state: GATE_STATES.NOT_RUN, reason: last, terminal: true };
}

function traceFiles(root) {
  if (!existsSync(root)) return [];
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const info = statSync(file);
      if (info.isDirectory()) walk(file);
      else if (name.endsWith('.zip') || name.endsWith('.trace'))
        found.push(file);
    }
  };
  walk(root);
  return found;
}

function* traceContents(file) {
  if (file.endsWith('.trace')) {
    if (statSync(file).size > MAX_TRACE_MEMBER_BYTES) {
      yield { complete: false };
      return;
    }
    yield { complete: true, content: readFileSync(file, 'utf8') };
    return;
  }
  let members;
  try {
    // Platforms without unzip (including native Windows) yield incomplete
    // inspection below, which keeps the classifier unknown/red.
    members = execFileSync('unzip', ['-Z1', file], {
      encoding: 'utf8',
      maxBuffer: MAX_TRACE_INDEX_BYTES,
    })
      .split('\n')
      .filter((member) => TRACE_MEMBER.test(member));
  } catch {
    yield { complete: false };
    return;
  }
  for (const member of members) {
    try {
      yield {
        complete: true,
        content: execFileSync('unzip', ['-p', file, member], {
          encoding: 'utf8',
          maxBuffer: MAX_TRACE_MEMBER_BYTES,
        }),
      };
    } catch {
      yield { complete: false };
    }
  }
}

function targetApiRoute(value, apiOrigin) {
  try {
    const url = new URL(value);
    return url.origin === apiOrigin && url.pathname.startsWith('/v1/')
      ? `${url.origin}${url.pathname}`
      : null;
  } catch {
    return null;
  }
}

function hasAmbiguousSignalFields(record) {
  const urls = [
    record?.metadata?.url,
    record?.request?.url,
    record?.url,
    record?.response?.url,
    record?.snapshot?.request?.url,
  ].filter((value) => value !== undefined && value !== null && value !== '');
  const normalizedUrls = [];
  for (const value of urls) {
    try {
      normalizedUrls.push(new URL(value).href);
    } catch {
      return true;
    }
  }
  if (new Set(normalizedUrls).size > 1) return true;

  const statuses = [
    record?.metadata?.status,
    record?.status,
    record?.response?.status,
    record?.snapshot?.response?.status,
  ].filter((value) => value !== undefined && value !== null);
  if (
    statuses.some((status) => !Number.isInteger(status)) ||
    new Set(statuses).size > 1
  )
    return true;

  const errors = [
    record?.metadata?.error?.error?.message,
    record?.metadata?.error?.message,
    record?.metadata?.errorText,
    record?.request?.error?.error?.message,
    record?.request?.error?.message,
    record?.request?.errorText,
    record?.error?.error?.message,
    record?.error?.message,
    record?.errorText,
    record?.response?.error?.error?.message,
    record?.response?.error?.message,
    record?.response?.errorText,
  ].filter((value) => value !== undefined && value !== null && value !== '');
  return new Set(errors.map(String)).size > 1;
}

function isRetryableResponse(url, status, apiOrigin, expectedRoute) {
  return (
    targetApiRoute(url, apiOrigin) === expectedRoute &&
    Number.isInteger(status) &&
    RETRYABLE.has(status)
  );
}

function isTransportFailure(url, error, apiOrigin, expectedRoute) {
  return (
    targetApiRoute(url, apiOrigin) === expectedRoute &&
    TRANSPORT.test(String(error ?? ''))
  );
}

function isApiNetworkSignal(line, apiOrigin, expectedRoute) {
  try {
    const record = JSON.parse(line);
    if (hasAmbiguousSignalFields(record)) return false;
    if (record?.type === 'response')
      return [
        [record?.metadata?.url, record?.metadata?.status],
        [record?.url, record?.status],
        [record?.response?.url, record?.response?.status],
      ].some(([url, status]) =>
        isRetryableResponse(url, status, apiOrigin, expectedRoute),
      );
    if (record?.type === 'requestfailed')
      return [
        [
          record?.metadata?.url,
          record?.metadata?.error?.error?.message ??
            record?.metadata?.error?.message ??
            record?.metadata?.errorText,
        ],
        [
          record?.request?.url,
          record?.request?.error?.error?.message ??
            record?.request?.error?.message ??
            record?.request?.errorText,
        ],
        [
          record?.url,
          record?.error?.error?.message ??
            record?.error?.message ??
            record?.errorText,
        ],
        [
          record?.response?.url,
          record?.response?.error?.error?.message ??
            record?.response?.error?.message ??
            record?.response?.errorText,
        ],
      ].some(([url, error]) =>
        isTransportFailure(url, error, apiOrigin, expectedRoute),
      );
    if (record?.type === 'resource-snapshot') {
      const status = record?.snapshot?.response?.status;
      return (
        targetApiRoute(record?.snapshot?.request?.url, apiOrigin) ===
          expectedRoute &&
        Number.isInteger(status) &&
        (status === -1 || RETRYABLE.has(status))
      );
    }
    return false;
  } catch {
    return false;
  }
}

function hasApiNetworkSignal(root, apiOrigin, expectedRoute) {
  let inspectedBytes = 0;
  let inspectedMembers = 0;
  let networkSignal = false;
  for (const file of traceFiles(root)) {
    for (const entry of traceContents(file)) {
      if (!entry.complete) return false;
      const content = entry.content;
      inspectedMembers += 1;
      inspectedBytes += Buffer.byteLength(content);
      if (
        inspectedMembers > MAX_TRACE_MEMBERS ||
        inspectedBytes > MAX_TRACE_TOTAL_BYTES
      )
        return false;
      if (
        content
          .split('\n')
          .some((line) => isApiNetworkSignal(line, apiOrigin, expectedRoute))
      )
        networkSignal = true;
    }
  }
  return networkSignal;
}

function hasNonTransportError(resultText) {
  return resultText.split('\n').some((line) => {
    const normalized = line.replace(ANSI_ESCAPE, '');
    return ERROR_LINE.test(normalized) && !RESULT_TRANSPORT.test(normalized);
  });
}

function resultTransportRoute(resultText, apiOrigin) {
  const routes = [];
  for (const line of resultText.split('\n')) {
    const match = RESULT_TRANSPORT.exec(line.replace(ANSI_ESCAPE, ''));
    if (!match) continue;
    const route = targetApiRoute(match[1], apiOrigin);
    if (!route) return null;
    routes.push(route);
  }
  return new Set(routes).size === 1 ? routes[0] : null;
}

/**
 * Inspect Playwright-owned trace network records. Console prose is excluded.
 * A hard result/configuration failure wins over a later canary outage.
 */
function classifyFailure({ artifactRoot, apiUrl, exitCode, resultText = '' }) {
  if (exitCode === 0) return { kind: 'success' };
  if (exitCode === 130 || exitCode === 143) return { kind: 'cancellation' };
  if (HARD_FAILURE.test(resultText) || hasNonTransportError(resultText))
    return { kind: 'product' };
  let apiOrigin;
  try {
    apiOrigin = validatedApiUrl(apiUrl).origin;
  } catch {
    return { kind: 'unknown' };
  }
  const expectedRoute = resultTransportRoute(resultText, apiOrigin);
  if (!expectedRoute) return { kind: 'unknown' };
  const networkSignal = hasApiNetworkSignal(
    artifactRoot,
    apiOrigin,
    expectedRoute,
  );
  return networkSignal ? { kind: 'infra-signalled' } : { kind: 'unknown' };
}

function decide({ preflight, postflight, classification, exitCode }) {
  // This is the workflow's sole pass/fail decision point. The shell only
  // gathers canary, suite, and classifier inputs before invoking --decide.
  // `not-run` models the workflow's pre-suite bail; classifyFailure never emits it.
  if (preflight === GATE_STATES.UNAVAILABLE && classification === 'not-run')
    return 0;
  if (exitCode === 0) return 0;
  if (
    classification === 'cancellation' ||
    classification === 'product' ||
    classification === 'unknown'
  )
    return exitCode || 1;
  return classification === 'infra-signalled' &&
    postflight === GATE_STATES.UNAVAILABLE
    ? 0
    : exitCode || 1;
}

function printState(result) {
  process.stdout.write(`GATE_STATE=${result.state}\n`);
}

function runDecisionCli([preflight, postflight, classification, exitCodeText]) {
  const exitCode = Number(exitCodeText);
  const states = new Set(Object.values(GATE_STATES));
  const classifications = new Set([
    'success',
    'cancellation',
    'product',
    'unknown',
    'infra-signalled',
    'not-run',
  ]);
  if (
    !states.has(preflight) ||
    !states.has(postflight) ||
    !classifications.has(classification) ||
    !Number.isInteger(exitCode) ||
    exitCode < 0
  ) {
    process.stderr.write('Invalid staging-gate decision input\n');
    return 2;
  }
  const decision = decide({ preflight, postflight, classification, exitCode });
  const reason =
    classification === 'not-run'
      ? decision === 0
        ? 'preflight-confirmed-unavailable'
        : 'preflight-not-run'
      : decision === 0 && exitCode !== 0
        ? 'confirmed-staging-outage'
        : decision === 0
          ? 'suite-success'
          : 'suite-failure';
  process.stdout.write(
    `GATE_DECISION=${decision === 0 ? 'pass' : 'fail'} REASON=${reason}\n`,
  );
  return decision;
}

module.exports = { GATE_STATES, runCanary, classifyFailure, decide };

(async () => {
  if (require.main === module) {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === '--canary') {
      const result = await runCanary({
        apiUrl: process.env.PLAYWRIGHT_API_URL,
        secret: process.env.TEST_SEED_SECRET,
      });
      printState(result);
      // State is the sole control channel; callers inspect GATE_STATE and emit
      // diagnostics without losing them to set -e.
      process.exit(0);
    }
    if (mode === '--classify') {
      const resultFile = args[2];
      const resultText =
        resultFile && existsSync(resultFile)
          ? readFileSync(resultFile, 'utf8')
          : '';
      const result = classifyFailure({
        artifactRoot: args[0] ?? 'apps/mobile/e2e-web/test-results',
        apiUrl: args[3],
        exitCode: Number(args[1] ?? 1),
        resultText,
      });
      process.stdout.write(`FAILURE_CLASS=${result.kind}\n`);
      // FAILURE_CLASS stdout is the sole semantic channel. Reaching this point
      // means classification executed normally; unexpected errors stay nonzero.
      process.exit(0);
    }
    if (mode === '--decide') {
      process.exit(runDecisionCli(args));
    }
    process.exit(2);
  }
})();
