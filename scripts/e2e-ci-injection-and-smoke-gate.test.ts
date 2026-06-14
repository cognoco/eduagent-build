// Regression guards for two CI workflow-correctness defects fixed in the
// PRG-14 audit clear-out:
//
//   F-151 — e2e-ci.yml had an unreachable analyze-step branch that inlined
//           `github.event.workflow_run.pull_requests[0].base.ref` into a shell
//           assignment: a latent script-injection sink (a crafted PR base-ref
//           branch name could break out of the assignment). The branch was
//           deleted. These tests fail if any shell `run:` block in e2e-ci.yml
//           re-introduces an interpolation of a workflow_run.pull_requests[*]
//           field — the exact injection shape.
//
//   F-157 — e2e-web.yml had a REQUIRED `Playwright web smoke` check that
//           silently reported success on every PR: the real smoke job was
//           skipped (secrets unavailable) and the required gate inherited that
//           skip as success — an always-green required gate that let surface
//           regressions merge with no E2E signal. The fix makes the required
//           check an HONEST, documented pass-through (reports the required name,
//           exits 0 on every path, never gates on run-smoke's pass/fail), with
//           the real `run-smoke` running as its own NON-required advisory check.
//           These tests fail if the required check regresses to the original
//           shape (gating its exit on run-smoke, or the required name migrating
//           onto the real smoke job so a skip silently passes).
//
// Style + harness match the sibling workflow-structure tests in this directory
// (e.g. e2e-web-cleanup.test.ts): parse the committed YAML with the `yaml`
// package and assert on structure. No fixtures, no mocks — the committed
// workflow files are the system under test.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const repoRoot = join(__dirname, '..');

function loadWorkflowRaw(name: string): string {
  return readFileSync(join(repoRoot, '.github', 'workflows', name), 'utf8');
}

function loadWorkflow(name: string): Record<string, unknown> {
  return parseYaml(loadWorkflowRaw(name)) as Record<string, unknown>;
}

type Job = {
  name?: string;
  if?: unknown;
  needs?: unknown;
  steps?: Array<Record<string, unknown>>;
};

/** Every shell script body across all steps of all jobs in a workflow. */
function allRunScripts(workflow: Record<string, unknown>): string[] {
  const jobs = (workflow.jobs ?? {}) as Record<string, Job>;
  const scripts: string[] = [];
  for (const job of Object.values(jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run === 'string') scripts.push(step.run);
    }
  }
  return scripts;
}

describe('[F-151] e2e-ci.yml has no workflow_run.pull_requests injection sink', () => {
  const raw = loadWorkflowRaw('e2e-ci.yml');
  const workflow = loadWorkflow('e2e-ci.yml');

  // Matches a `pull_requests` access off the workflow_run event payload in BOTH
  // GitHub-expression notations — dot (`workflow_run.pull_requests`) and bracket
  // (`workflow_run['pull_requests']`), plus mixed forms — so a bracket-notation
  // rewrite cannot dodge the guard.
  const WORKFLOW_RUN_PR_ACCESS =
    /workflow_run\s*(?:\.\s*pull_requests|\[\s*['"]pull_requests['"]\s*\])/;

  it('no shell run: block accesses a workflow_run.pull_requests field', () => {
    // The injection sink was `${{ github.event.workflow_run.pull_requests[0].base.ref }}`
    // assigned into a shell variable. Any pull_requests field reached via the
    // workflow_run event payload and substituted into a run: block is the same
    // class of sink (the value is influenced by an attacker-controlled branch name).
    const offending = allRunScripts(workflow).filter((s) =>
      WORKFLOW_RUN_PR_ACCESS.test(s),
    );
    expect(offending).toEqual([]);
  });

  it('does not reference workflow_run.pull_requests anywhere in the file (dot or bracket notation)', () => {
    // Belt-and-braces over the whole file text (catches the field if it ever
    // resurfaces in an env: mapping or a future job the parser walk misses).
    expect(raw).not.toMatch(WORKFLOW_RUN_PR_ACCESS);
  });

  it('the analyze step survives only the non-pull_request workflow_run path (HEAD~1 base)', () => {
    // Positive assertion that the surviving logic is the intended one: after the
    // dead branch was removed, the workflow_run diff base is the previous commit.
    const analyze = allRunScripts(workflow).find((s) =>
      s.includes('run-api-e2e='),
    );
    expect(analyze).toBeDefined();
    expect(analyze!).toMatch(/BASE="HEAD~1"/);
  });
});

describe('[F-157] e2e-web.yml required smoke check is an honest pass-through', () => {
  const workflow = loadWorkflow('e2e-web.yml');
  const jobs = workflow.jobs as Record<string, Job>;

  const REQUIRED_CHECK_NAME = 'Playwright web smoke';

  function jobsWithName(name: string): Array<[string, Job]> {
    return Object.entries(jobs).filter(([, j]) => j.name === name);
  }

  it('exactly one job carries the required check name', () => {
    // Branch protection matches the required status check by job display name.
    // Exactly one job may own it, or the required check is ambiguous.
    expect(jobsWithName(REQUIRED_CHECK_NAME)).toHaveLength(1);
  });

  it('the required check is a dedicated gate job, not the real smoke runner', () => {
    // The original F-157 bug was the required name riding a job that gets
    // skipped (so a skip reports success). The required name must NOT live on
    // run-smoke (the job that is skipped on PRs / when secrets are absent).
    // The job-id is a convention (currently "smoke"); the load-bearing invariant
    // is that the name-bearer is not the smoke runner.
    const [[gateJobId]] = jobsWithName(REQUIRED_CHECK_NAME);
    expect(gateJobId).not.toBe('run-smoke');
    expect(jobs['run-smoke']?.name).not.toBe(REQUIRED_CHECK_NAME);
  });

  it('the required gate always runs (if: always()) so it is never a skipped-success', () => {
    // Accept both the bare and wrapped expression forms — they are functionally
    // identical in GitHub Actions, so a linter reformat must not false-positive.
    const [[, gate]] = jobsWithName(REQUIRED_CHECK_NAME);
    const ifVal = String(gate.if ?? '').replace(/\s+/g, '');
    expect(ifVal === 'always()' || ifVal === '${{always()}}').toBe(true);
  });

  it('the required gate exits 0 and never branches its exit on the run-smoke result', () => {
    const [[, gate]] = jobsWithName(REQUIRED_CHECK_NAME);
    const step = (gate.steps ?? []).find((s) => typeof s.run === 'string');
    const script = String(step?.run ?? '');
    const stepEnv = (step?.env ?? {}) as Record<string, unknown>;

    // Honest pass-through: the script reaches exit 0 ...
    expect(script).toMatch(/exit 0/);

    // ... and never branches its exit code on run-smoke's outcome. That is the
    // precise F-157 invariant: the required check is advisory-only over the
    // smoke (secret-backed smoke is un-runnable in CI until DOPPLER_TOKEN_STG is
    // provisioned, so gating on it would make the required check permanently red
    // on trusted web PRs). run-smoke's result may be referenced for LOGGING via
    // an env var, but the gate must not read needs.run-smoke.result to decide a
    // failing exit. We assert the gate does not consume run-smoke's result as a
    // control signal: it is either unreferenced, or referenced only as a
    // log-only env var whose name does not appear in any conditional/exit branch.
    expect(script).not.toMatch(/needs\s*\.\s*run-smoke\s*\.\s*result/);
    // If run-smoke's result is surfaced as an env var (log-only), it must not be
    // used in a conditional that drives a failing exit. Catch the regression
    // shape `if [[ ... $SMOKE_RESULT ... ]]; then ... exit 1`.
    const smokeEnvVars = Object.entries(stepEnv)
      .filter(([, v]) => /needs\s*\.\s*run-smoke\s*\.\s*result/.test(String(v)))
      .map(([k]) => k);
    for (const v of smokeEnvVars) {
      // The env var may appear in echo/log lines, but never inside an `if [[ ... ]]`
      // test condition (which is how a hard gate would branch to exit 1).
      const conditionRefs = new RegExp(String.raw`if\s*\[\[[^\n]*\$\{?${v}\b`);
      expect(script).not.toMatch(conditionRefs);
    }
  });

  it('run-smoke runs the real suite, is reachable (not if:false), and is advisory only', () => {
    // run-smoke must exist and run the real Playwright smoke ...
    const runSmoke = jobs['run-smoke'];
    expect(runSmoke).toBeDefined();
    const runSmokeScript = (runSmoke.steps ?? [])
      .map((s) => (typeof s.run === 'string' ? s.run : ''))
      .join('\n');
    expect(runSmokeScript).toMatch(/test:e2e:web:smoke/);

    // ... it must be reachable — a permanently-disabled `if: false` would make
    // the advisory check a silent no-op, hollowing out the real signal.
    const runSmokeIf = String(runSmoke.if ?? '').replace(/\s+/g, '');
    expect(runSmokeIf).not.toBe('false');
    expect(runSmokeIf).not.toBe('${{false}}');

    // ... but it must NOT be a required-check name-bearer (advisory only).
    expect(runSmoke.name).not.toBe(REQUIRED_CHECK_NAME);
  });
});
