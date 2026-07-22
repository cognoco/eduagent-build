// Maestro-on-main health surfacer — WI-2596 (AC-3).
//
// The "E2E Tests" workflow (.github/workflows/e2e-ci.yml) only executes the
// Android-emulator Maestro job on `main` when a commit is change-class routed to
// mobile (touches apps/mobile/src, app.json, apps/mobile/e2e, shared schemas, or
// the lockfile) OR on the nightly schedule. On every other main commit the job is
// skipped, so a genuine Maestro breakage on `main` stays invisible until the next
// mobile lane lands and inherits a red landing check that is not theirs — a
// false-attribution trap (WI-2596 Risk/Impact).
//
// This checker reads the last-known Maestro-on-main status directly from the
// workflow-run history, INDEPENDENT of change-class routing, and classifies it
// green / red / stale. A scheduled workflow (.github/workflows/maestro-main-health.yml)
// runs it a few times a day and goes visibly red — and best-effort opens a single
// tracking issue — when main's Maestro health is red or stale. That makes the
// breakage visible without waiting for a mobile lane to trip over it.
//
// Design: `classifyMaestroHealth` is a pure function over already-fetched run
// records (no network) so it is unit-tested directly; `fetchMaestroRuns` is the
// thin `gh api` I/O seam used only by `main()`.

import { execFileSync } from 'node:child_process';

/** A single job inside a workflow run (we only care about the Maestro shards). */
export interface WorkflowJob {
  name: string;
  /** GitHub job conclusion: success | failure | skipped | cancelled | null (running). */
  conclusion: string | null;
}

/** One "E2E Tests" workflow run, with its jobs resolved. */
export interface WorkflowRun {
  id: number;
  headSha: string;
  headBranch: string;
  /** push | schedule | workflow_run | workflow_dispatch | … */
  event: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  jobs: WorkflowJob[];
}

export type HealthVerdict = 'green' | 'red' | 'stale';

export interface HealthResult {
  verdict: HealthVerdict;
  /** The most recent run on main that actually EXECUTED the Maestro shards. */
  lastExecutedRun?: WorkflowRun;
  /** Names of Maestro shard jobs that failed in lastExecutedRun (red only). */
  failingShards: string[];
  /** Human-readable one-line explanation. */
  reason: string;
}

/** The Maestro shard jobs are named "Mobile Maestro E2E Tests (N)". */
const MAESTRO_JOB_PREFIX = 'Mobile Maestro E2E Tests';

export function isMaestroJob(job: WorkflowJob): boolean {
  return job.name.startsWith(MAESTRO_JOB_PREFIX);
}

/**
 * A run "executed" Maestro iff at least one Maestro shard reached a terminal
 * pass/fail conclusion. A change-class-skipped run has those jobs `skipped`
 * (or absent); a still-running run has them `null`. Neither counts as executed.
 */
export function runExecutedMaestro(run: WorkflowRun): boolean {
  return run.jobs.some(
    (job) =>
      isMaestroJob(job) &&
      (job.conclusion === 'success' || job.conclusion === 'failure'),
  );
}

/**
 * Only the automatic pr/nightly suites represent Maestro-on-main HEALTH:
 * `schedule` runs the 8-shard nightly suite and `workflow_run` runs the 4-shard
 * pr suite after CI. A manual `workflow_dispatch` can instead be an ad-hoc `v2`
 * publish-readiness run — a SINGLE shard under the same "Mobile Maestro E2E Tests"
 * job name and a different flow set — so trusting it would let a passing v2 dispatch
 * mask a red pr/nightly main suite. Exclude dispatches; the daily schedule and the
 * per-mobile-push workflow_run give continuous, unambiguous signal without them.
 */
export function isHealthSuiteRun(run: WorkflowRun): boolean {
  return run.event === 'schedule' || run.event === 'workflow_run';
}

function failingMaestroShards(run: WorkflowRun): string[] {
  return run.jobs
    .filter((job) => isMaestroJob(job) && job.conclusion === 'failure')
    .map((job) => job.name)
    .sort((a, b) => a.localeCompare(b));
}

export interface ClassifyOptions {
  /** Runs older than this many hours without an executed Maestro run ⇒ stale. */
  staleAfterHours?: number;
  /** Injected "now" for deterministic tests. */
  now?: Date;
}

/**
 * Classify main's Maestro health from the run history (newest-first not required;
 * we sort defensively). Pure — no I/O.
 */
export function classifyMaestroHealth(
  runs: WorkflowRun[],
  options: ClassifyOptions = {},
): HealthResult {
  const staleAfterHours = options.staleAfterHours ?? 30;
  const now = options.now ?? new Date();

  const mainRuns = runs
    .filter((run) => run.headBranch === 'main' && isHealthSuiteRun(run))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const lastExecutedRun = mainRuns.find(runExecutedMaestro);

  if (!lastExecutedRun) {
    return {
      verdict: 'stale',
      failingShards: [],
      reason:
        'No E2E Tests run on main has executed the Maestro shards in the fetched history — Maestro-on-main health is unknown.',
    };
  }

  const ageHours =
    (now.getTime() - Date.parse(lastExecutedRun.createdAt)) / 3_600_000;
  if (ageHours > staleAfterHours) {
    return {
      verdict: 'stale',
      lastExecutedRun,
      failingShards: [],
      reason:
        `The last Maestro-on-main execution (run ${lastExecutedRun.id}, ${lastExecutedRun.headSha.slice(0, 12)}) ` +
        `was ${ageHours.toFixed(1)}h ago, exceeding the ${staleAfterHours}h freshness window — the nightly may have stopped executing Maestro.`,
    };
  }

  const failingShards = failingMaestroShards(lastExecutedRun);
  if (failingShards.length > 0) {
    return {
      verdict: 'red',
      lastExecutedRun,
      failingShards,
      reason:
        `Maestro is RED on main: run ${lastExecutedRun.id} (${lastExecutedRun.headSha.slice(0, 12)}, ${lastExecutedRun.event}) ` +
        `had ${failingShards.length} failing shard(s): ${failingShards.join(', ')}.`,
    };
  }

  return {
    verdict: 'green',
    lastExecutedRun,
    failingShards: [],
    reason:
      `Maestro is green on main: run ${lastExecutedRun.id} (${lastExecutedRun.headSha.slice(0, 12)}, ${lastExecutedRun.event}) ` +
      `executed all Maestro shards successfully ${ageHours.toFixed(1)}h ago.`,
  };
}

// ─────────────────────────── I/O seam (gh api) ───────────────────────────

const WORKFLOW_FILE = 'e2e-ci.yml';

function gh(args: string[]): string {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

interface RunMeta {
  id: number;
  head_sha: string;
  head_branch: string;
  event: string;
  created_at: string;
  status: string;
}

/** List completed main-branch "E2E Tests" runs for one trigger event, newest-first. */
function listMainRunsByEvent(
  repo: string,
  event: string,
  perPage: number,
): RunMeta[] {
  const raw = gh([
    'api',
    '-X',
    'GET',
    `repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs`,
    '-f',
    `event=${event}`,
    // Filter to completed main runs SERVER-SIDE, before `per_page` is applied.
    // `workflow_run` fires for PR-origin runs too, so a client-only filter would
    // let a busy first page of non-main/skipped runs bury a fresh main execution
    // outside the window (the surfacer would then classify off the older nightly).
    '-f',
    'branch=main',
    '-f',
    'status=completed',
    '-F',
    `per_page=${perPage}`,
  ]);
  const parsed = JSON.parse(raw) as { workflow_runs?: RunMeta[] };
  return (
    (parsed.workflow_runs ?? [])
      // Defensive backstop: the server-side branch/status filters above are the
      // primary guard; this re-check costs nothing and guards against API quirks.
      .filter((r) => r.head_branch === 'main' && r.status === 'completed')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  );
}

/** Resolve one run's jobs into a WorkflowRun. */
function resolveRun(repo: string, meta: RunMeta): WorkflowRun {
  const jobsRaw = gh([
    'api',
    '-X',
    'GET',
    `repos/${repo}/actions/runs/${meta.id}/jobs`,
    '-F',
    'per_page=50',
  ]);
  const jobsParsed = JSON.parse(jobsRaw) as {
    jobs?: Array<{ name: string; conclusion: string | null }>;
  };
  return {
    id: meta.id,
    headSha: meta.head_sha,
    headBranch: meta.head_branch,
    event: meta.event,
    createdAt: meta.created_at,
    jobs: (jobsParsed.jobs ?? []).map((j) => ({
      name: j.name,
      conclusion: j.conclusion,
    })),
  };
}

/**
 * Fetch the runs the classifier needs, with jobs resolved.
 *
 * The `event` type matters here. On a busy `main`, EVERY CI completion triggers a
 * `workflow_run` E2E run — dozens per day — and most change-class-skip Maestro. An
 * unfiltered "recent runs" list is therefore ~all Maestro-skipped `workflow_run`
 * runs and would never surface the nightly, making the checker report STALE forever.
 * Instead we query by trigger:
 *   - `schedule` (the nightly): unconditionally executes the full 8-shard suite on
 *     main, so it is the RELIABLE health signal — always resolve the latest few.
 *   - `workflow_run` (post-CI pr suite): adds FRESHER signal only when a mobile commit
 *     landed; scan newest→oldest only until one that actually executed Maestro is found.
 * The classifier then picks the most recent EXECUTED health-suite run across both.
 */
export function fetchMaestroRuns(
  repo: string,
  options: {
    scheduleResolve?: number;
    workflowRunPerPage?: number;
    workflowRunScan?: number;
  } = {},
): WorkflowRun[] {
  const scheduleResolve = options.scheduleResolve ?? 3;
  const workflowRunPerPage = options.workflowRunPerPage ?? 30;
  const workflowRunScan = options.workflowRunScan ?? 15;

  const resolved: WorkflowRun[] = [];
  const seen = new Set<number>();

  // 1. Reliable signal: always resolve the latest few nightly (schedule) runs.
  //    `scheduleResolve` is passed as `per_page`, so the list is already bounded.
  for (const meta of listMainRunsByEvent(repo, 'schedule', scheduleResolve)) {
    if (seen.has(meta.id)) continue;
    seen.add(meta.id);
    resolved.push(resolveRun(repo, meta));
  }

  // 2. Fresher signal: scan recent workflow_run (pr) runs only until one that
  //    actually executed Maestro (a mobile landing) is found, bounded by the scan cap.
  let scanned = 0;
  for (const meta of listMainRunsByEvent(
    repo,
    'workflow_run',
    workflowRunPerPage,
  )) {
    if (scanned >= workflowRunScan) break;
    if (seen.has(meta.id)) continue;
    seen.add(meta.id);
    scanned += 1;
    const run = resolveRun(repo, meta);
    resolved.push(run);
    if (runExecutedMaestro(run)) break;
  }

  return resolved;
}

function parseArgs(argv: string[]): { repo: string; staleHours: number } {
  let repo = process.env.GITHUB_REPOSITORY ?? '';
  let staleHours = 30;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') repo = argv[++i] ?? repo;
    else if (arg === '--stale-hours') staleHours = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!repo) {
    throw new Error(
      'Repository not provided: pass --repo owner/name or set GITHUB_REPOSITORY.',
    );
  }
  if (!Number.isFinite(staleHours) || staleHours <= 0) {
    throw new Error('--stale-hours must be a positive number.');
  }
  return { repo, staleHours };
}

function main(): number {
  const { repo, staleHours } = parseArgs(process.argv.slice(2));
  const runs = fetchMaestroRuns(repo);
  const result = classifyMaestroHealth(runs, { staleAfterHours: staleHours });

  process.stdout.write(
    `maestro-main-health: ${result.verdict.toUpperCase()}\n`,
  );
  process.stdout.write(`  ${result.reason}\n`);
  if (result.lastExecutedRun) {
    const r = result.lastExecutedRun;
    process.stdout.write(
      `  last-executed: run ${r.id} sha=${r.headSha} event=${r.event} at=${r.createdAt}\n`,
    );
  }

  // Green ⇒ 0. Red or stale ⇒ 1 (visible failure; the scheduled workflow surfaces it).
  return result.verdict === 'green' ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(
      `maestro-main-health: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    // Exit 2 (distinct from a red/stale verdict) so a tooling/auth failure is
    // never silently rounded to a health verdict.
    process.exit(2);
  }
}
