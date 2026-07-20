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
//           silently reported success on every PR. WI-2228 promotes the isolated
//           v2-release project to the hard signal for trusted surface changes,
//           while forks, untrusted PRs, and no-surface changes remain explicit
//           pass-throughs. Legacy smoke stays visible but advisory in the same
//           setup job. These tests execute the required gate's shell matrix and
//           assert that legacy coverage cannot mask the V2 result.
//
// Style + harness match the sibling workflow-structure tests in this directory
// (e.g. e2e-web-cleanup.test.ts): parse the committed YAML with the `yaml`
// package and assert on structure. No fixtures, no mocks — the committed
// workflow files are the system under test.

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as ts from 'typescript';
import { parse as parseYaml, parseAllDocuments } from 'yaml';

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
  env?: Record<string, unknown>;
  needs?: unknown;
  strategy?: Record<string, unknown>;
  steps?: Array<Record<string, unknown>>;
  'continue-on-error'?: unknown;
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

  // Matches a `pull_requests` access reached through the workflow_run event
  // payload in EITHER GitHub-expression notation, on BOTH hops:
  //   - workflow_run reached by dot (`...workflow_run...`) OR bracket
  //     (`github.event['workflow_run']...`);
  //   - pull_requests reached by dot (`.pull_requests`) OR bracket
  //     (`['pull_requests']`).
  // So none of these dodge the guard:
  //   ${{ github.event.workflow_run.pull_requests[0].base.ref }}
  //   ${{ github.event.workflow_run['pull_requests'][0].base.ref }}
  //   ${{ github.event['workflow_run'].pull_requests[0].base.ref }}
  //   ${{ github.event['workflow_run']['pull_requests'][0].base.ref }}
  const WORKFLOW_RUN_REF = /(?:workflow_run|\[\s*['"]workflow_run['"]\s*\])/
    .source;
  const PULL_REQUESTS_REF =
    /(?:\.\s*pull_requests|\[\s*['"]pull_requests['"]\s*\])/.source;
  // Allow only intervening whitespace between the two hops (the bracket form
  // `['workflow_run']` is immediately followed by the pull_requests access).
  const WORKFLOW_RUN_PR_ACCESS = new RegExp(
    `${WORKFLOW_RUN_REF}\\s*${PULL_REQUESTS_REF}`,
  );

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

  it('the matcher catches every workflow_run.pull_requests notation (incl. bracketed workflow_run) and ignores benign access', () => {
    // Proves the guard would catch the sink reintroduced in ANY of the four
    // dot/bracket combinations — including bracketed access to workflow_run
    // itself — without false-positiving on benign workflow_run fields.
    const sinkShapes = [
      '${{ github.event.workflow_run.pull_requests[0].base.ref }}',
      "${{ github.event.workflow_run['pull_requests'][0].base.ref }}",
      "${{ github.event['workflow_run'].pull_requests[0].base.ref }}",
      "${{ github.event['workflow_run']['pull_requests'][0].base.ref }}",
    ];
    for (const shape of sinkShapes) {
      expect(WORKFLOW_RUN_PR_ACCESS.test(shape)).toBe(true);
    }
    const benign = [
      '${{ github.event.workflow_run.head_sha }}',
      '${{ github.event.workflow_run.event }}',
      "${{ github.event['workflow_run'].conclusion }}",
    ];
    for (const shape of benign) {
      expect(WORKFLOW_RUN_PR_ACCESS.test(shape)).toBe(false);
    }
  });
});

describe('[WI-2228] e2e-web.yml hard-gates V2 and isolates legacy smoke', () => {
  const workflow = loadWorkflow('e2e-web.yml');
  const jobs = workflow.jobs as Record<string, Job>;
  const REQUIRED_CHECK_NAME = 'Playwright web smoke';

  function jobsWithName(name: string): Array<[string, Job]> {
    return Object.entries(jobs).filter(([, j]) => j.name === name);
  }

  function stepNamed(job: Job, name: string) {
    return job.steps?.find((step) => step.name === name);
  }

  function runRequiredGate(overrides: Record<string, string>) {
    const [[, gate]] = jobsWithName(REQUIRED_CHECK_NAME);
    const script = String(
      gate.steps?.find((step) => typeof step.run === 'string')?.run ?? '',
    );
    return spawnSync('bash', ['-c', script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        CHANGES_RESULT: 'success',
        SMOKE_RESULT: 'success',
        RUN_REAL: 'true',
        TRUSTED: 'true',
        ...overrides,
      },
    });
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

  it.each([
    ['change detector failure', { CHANGES_RESULT: 'failure' }, 1],
    ['change detector skipped', { CHANGES_RESULT: 'skipped' }, 1],
    ['V2 failure', { SMOKE_RESULT: 'failure' }, 1],
    ['V2 cancellation', { SMOKE_RESULT: 'cancelled' }, 1],
    ['trusted V2 skip', { SMOKE_RESULT: 'skipped' }, 1],
    [
      'missing run-real output fails closed',
      { RUN_REAL: '', TRUSTED: 'true', SMOKE_RESULT: 'skipped' },
      1,
    ],
    ['V2 success', {}, 0],
    [
      'fork pass-through',
      { RUN_REAL: 'false', TRUSTED: 'false', SMOKE_RESULT: 'skipped' },
      0,
    ],
    [
      'no-surface pass-through',
      { RUN_REAL: 'false', TRUSTED: 'true', SMOKE_RESULT: 'skipped' },
      0,
    ],
  ])('executes the required gate matrix: %s', (_name, env, expected) => {
    const result = runRequiredGate(env as Record<string, string>);
    expect(result.status).toBe(expected);
  });

  it('runs the V2 release gate first and keeps legacy smoke advisory in one setup job', () => {
    const runSmoke = jobs['run-smoke'];
    expect(runSmoke).toBeDefined();
    const v2Step = stepNamed(runSmoke, 'Run V2 release Playwright gate');
    const uploadV2 = stepNamed(runSmoke, 'Upload V2 Playwright artifacts');
    const legacyStep = stepNamed(
      runSmoke,
      'Run legacy Playwright smoke (advisory)',
    );
    const resetStep = stepNamed(
      runSmoke,
      'Reset seeded staging accounts (always)',
    );
    const uploadLegacy = stepNamed(
      runSmoke,
      'Upload legacy Playwright artifacts',
    );
    const stepNames = (runSmoke.steps ?? []).map((step) => step.name);
    const allWorkflowSteps = Object.values(jobs).flatMap(
      (job) => job.steps ?? [],
    );
    const v2Script = String(v2Step?.run ?? '');
    const legacyScript = String(legacyStep?.run ?? '');
    const classifyCommand = v2Script
      .split('\n')
      .find((line) => line.includes('--classify'));

    expect(v2Step).toBeDefined();
    expect(v2Step?.['continue-on-error']).not.toBe(true);
    expect(v2Script).toContain('pnpm run test:e2e:web:v2');
    expect(v2Script).not.toContain('pnpm run test:e2e:web:smoke');
    expect(v2Script).toContain('playwright-staging-gate.cjs --decide');
    expect(classifyCommand).toBeDefined();
    expect(classifyCommand).toContain('${PLAYWRIGHT_API_URL}');

    expect(uploadV2?.if).toBe('always()');
    expect(uploadV2?.['continue-on-error']).toBe(true);
    expect(Number(uploadV2?.['timeout-minutes'])).toBeGreaterThan(0);
    expect(String((uploadV2?.with as Record<string, unknown>)?.name)).toContain(
      'playwright-web-v2-${{ github.run_id }}-${{ github.run_attempt }}',
    );
    expect(legacyStep?.['continue-on-error']).toBe(true);
    expect(Number(legacyStep?.['timeout-minutes'])).toBeGreaterThan(0);
    expect(
      Number(runSmoke['timeout-minutes']) -
        Number(legacyStep?.['timeout-minutes']),
    ).toBeGreaterThanOrEqual(20);
    expect(String(legacyStep?.if).replace(/\s+/g, '')).toContain(
      'always()&&!cancelled()',
    );
    expect(legacyStep?.env?.DOPPLER_TOKEN).toBe(v2Step?.env?.DOPPLER_TOKEN);
    expect(legacyScript).toContain('doppler run -p mentomate -c stg');
    for (const mapping of [
      'PLAYWRIGHT_TEST_SEED_SECRET',
      'CLERK_SECRET_KEY',
      'PLAYWRIGHT_API_URL',
    ]) {
      expect(v2Script).toContain(mapping);
      expect(legacyScript).toContain(mapping);
    }
    expect(legacyScript).toContain('PLAYWRIGHT_ARTIFACT_LANE=legacy');
    expect(legacyScript).toContain('pnpm run test:e2e:web:smoke');
    for (const legacyOnlyStep of [legacyStep, uploadLegacy]) {
      expect(legacyOnlyStep?.['continue-on-error']).toBe(true);
      expect(Number(legacyOnlyStep?.['timeout-minutes'])).toBeGreaterThan(0);
    }
    expect(String(uploadLegacy?.if)).toContain(
      "steps.legacy-smoke.outcome == 'success'",
    );
    expect(String(uploadLegacy?.if)).toContain(
      "steps.legacy-smoke.outcome == 'failure'",
    );
    expect(
      String((uploadLegacy?.with as Record<string, unknown>)?.name),
    ).toContain(
      'playwright-web-legacy-${{ github.run_id }}-${{ github.run_attempt }}',
    );
    const v2ArtifactPaths = String(
      (uploadV2?.with as Record<string, unknown>)?.path,
    );
    const legacyArtifactPaths = String(
      (uploadLegacy?.with as Record<string, unknown>)?.path,
    );
    expect(v2ArtifactPaths).toContain('playwright-report');
    expect(v2ArtifactPaths).toContain('test-results');
    expect(v2ArtifactPaths).not.toContain('playwright-report-legacy');
    expect(v2ArtifactPaths).not.toContain('test-results-legacy');
    expect(legacyArtifactPaths).toContain('playwright-report-legacy');
    expect(legacyArtifactPaths).toContain('test-results-legacy');

    expect(stepNames.indexOf(uploadV2?.name)).toBe(
      stepNames.indexOf(v2Step?.name) + 1,
    );
    expect(stepNames.indexOf(uploadV2?.name)).toBeLessThan(
      stepNames.indexOf(legacyStep?.name),
    );
    expect(stepNames.indexOf(legacyStep?.name)).toBeLessThan(
      stepNames.indexOf(resetStep?.name),
    );
    expect(stepNames.indexOf(resetStep?.name)).toBeLessThan(
      stepNames.indexOf(uploadLegacy?.name),
    );
    expect(
      allWorkflowSteps.filter(
        (step) => step.name === 'Reset seeded staging accounts (always)',
      ),
    ).toHaveLength(1);
    expect(
      allWorkflowSteps.filter((step) =>
        String(step.uses ?? '').startsWith('actions/setup-node@'),
      ),
    ).toHaveLength(1);
    expect(
      allWorkflowSteps.filter((step) =>
        String(step.uses ?? '').startsWith('pnpm/action-setup@'),
      ),
    ).toHaveLength(1);
    expect(runSmoke.name).not.toBe(REQUIRED_CHECK_NAME);
  });

  it('treats root package.json as a trusted E2E surface change', () => {
    const changes = jobs['changes']!;
    const detector = stepNamed(
      changes,
      'Decide whether to run the real smoke suite',
    );
    expect(String(detector?.run)).toMatch(
      /apps\/\*\|packages\/\*\|package\.json\|pnpm-lock\.yaml/,
    );
  });

  it('routes only the validated legacy lane to distinct Playwright artifact paths', () => {
    const inspectSource = [
      "import config from './apps/mobile/playwright.config.ts';",
      'const reporters = config.reporter as unknown as Array<[string, Record<string, string>?]>;',
      "const html = reporters.find(([name]) => name === 'html');",
      'process.stdout.write(JSON.stringify({ outputDir: config.outputDir, reportDir: html?.[1]?.outputFolder }));',
    ].join(' ');
    const inspect = (lane?: string) => {
      const env = { ...process.env };
      if (lane === undefined) delete env.PLAYWRIGHT_ARTIFACT_LANE;
      else env.PLAYWRIGHT_ARTIFACT_LANE = lane;
      return spawnSync('pnpm', ['exec', 'tsx', '-e', inspectSource], {
        cwd: repoRoot,
        encoding: 'utf8',
        env,
      });
    };

    const defaultResult = inspect();
    expect(defaultResult.status).toBe(0);
    const defaultArtifacts = JSON.parse(
      defaultResult.stdout.trim().split('\n').at(-1)!,
    ) as { outputDir: string; reportDir: string };
    expect(
      Object.fromEntries(
        Object.entries(defaultArtifacts).map(([key, value]) => [
          key,
          value.replaceAll('\\', '/'),
        ]),
      ),
    ).toMatchObject({
      outputDir: expect.stringMatching(/e2e-web\/test-results$/),
      reportDir: expect.stringMatching(/e2e-web\/playwright-report$/),
    });

    const legacyResult = inspect('legacy');
    expect(legacyResult.status).toBe(0);
    const legacyArtifacts = JSON.parse(
      legacyResult.stdout.trim().split('\n').at(-1)!,
    ) as { outputDir: string; reportDir: string };
    expect(
      Object.fromEntries(
        Object.entries(legacyArtifacts).map(([key, value]) => [
          key,
          value.replaceAll('\\', '/'),
        ]),
      ),
    ).toMatchObject({
      outputDir: expect.stringMatching(/e2e-web\/test-results-legacy$/),
      reportDir: expect.stringMatching(/e2e-web\/playwright-report-legacy$/),
    });

    const invalidResult = inspect('not-a-lane');
    expect(invalidResult.status).not.toBe(0);
    expect(invalidResult.stderr).toContain('PLAYWRIGHT_ARTIFACT_LANE');
  });

  it('wires the V2 Playwright project and hard workflow-dispatch Maestro plan', () => {
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const playwrightConfig = readFileSync(
      join(repoRoot, 'apps/mobile/playwright.config.ts'),
      'utf8',
    );
    const docsWorkflow = loadWorkflow('docs-checks.yml');
    const docsJobs = docsWorkflow.jobs as Record<string, Job>;
    const docsOn = docsWorkflow.on as Record<string, unknown>;
    const maestroValidator = docsJobs['maestro-validator']!;
    const maestroScripts = (maestroValidator.steps ?? [])
      .map((step) => String(step.run ?? ''))
      .join('\n');

    expect(packageJson.scripts['test:e2e:web:v2']).toContain(
      '--project=v2-release',
    );
    expect(playwrightConfig).toContain("name: 'v2-release'");
    expect(docsOn).toHaveProperty('workflow_dispatch');
    for (const event of ['push', 'pull_request']) {
      const trigger = docsOn[event] as { paths?: string[] };
      expect(trigger.paths).toEqual(
        expect.arrayContaining([
          'apps/mobile/e2e/ci-maestro-manifest.json',
          'apps/mobile/e2e/scripts/ci-maestro-plan.mjs',
        ]),
      );
    }
    expect(maestroValidator['continue-on-error']).not.toBe(true);
    expect(maestroScripts).toContain(
      'ci-maestro-plan.mjs --suite v2 --all --format json',
    );
  });
});

describe('[WI-1651] e2e-ci.yml propagates Maestro failures', () => {
  const workflow = loadWorkflow('e2e-ci.yml');
  const jobs = workflow.jobs as Record<string, Job>;
  const mobileMaestro = jobs['mobile-maestro']!;
  const runnerStep = mobileMaestro.steps?.find((step) =>
    String(step.uses ?? '').startsWith(
      'reactivecircus/android-emulator-runner@',
    ),
  );

  it('runs one durable shell script and does not mask a failed runner step', () => {
    const runnerWith = runnerStep?.with as Record<string, unknown> | undefined;

    expect(runnerStep).toBeDefined();
    expect(String(runnerWith?.script ?? '').trim()).toBe(
      'bash apps/mobile/e2e/scripts/run-ci-maestro.sh',
    );
    expect(mobileMaestro['continue-on-error']).not.toBe(true);
  });

  it('returns the Maestro exit code and captures both failure artifacts', () => {
    const harness = createMaestroHarness(23);

    try {
      const result = runCiMaestro(harness);

      expect(result.status).toBe(23);
      expect(
        readFileSync(
          join(harness.outputDir, 'failure-final-state.png'),
          'utf8',
        ),
      ).toBe('fake-png');
      expect(readFileSync(join(harness.outputDir, 'logcat.txt'), 'utf8')).toBe(
        'fake-logcat',
      );
    } finally {
      rmSync(harness.root, { recursive: true, force: true });
    }
  });

  it('returns zero without creating failure artifacts when Maestro passes', () => {
    const harness = createMaestroHarness(0);

    try {
      const result = runCiMaestro(harness);

      expect(result.status).toBe(0);
      expect(
        existsSync(join(harness.outputDir, 'failure-final-state.png')),
      ).toBe(false);
      expect(existsSync(join(harness.outputDir, 'logcat.txt'))).toBe(false);
    } finally {
      rmSync(harness.root, { recursive: true, force: true });
    }
  });

  it('does not launch Maestro when a seeded shard cannot be prepared', () => {
    const harness = createMaestroHarness(0);

    try {
      const result = runCiMaestro(harness, {
        MAESTRO_CI_SHARD: '2',
        FAKE_CURL_EXIT: '31',
      });

      expect(result.status).not.toBe(0);
      expect(existsSync(harness.maestroMarker)).toBe(false);
    } finally {
      rmSync(harness.root, { recursive: true, force: true });
    }
  });
});

describe('[WI-1652] Maestro CI selects the declared recursive flow suites', () => {
  const workflow = loadWorkflow('e2e-ci.yml');
  const jobs = workflow.jobs as Record<string, Job>;
  const mobileMaestro = jobs['mobile-maestro']!;
  const workspaceConfig = parseYaml(
    readFileSync(join(repoRoot, 'apps/mobile/e2e/config.yaml'), 'utf8'),
  ) as { flows?: string[] };

  function loadPlan(suite: 'pr' | 'nightly' | 'v2') {
    const result = spawnSync(
      'node',
      [
        join(repoRoot, 'apps/mobile/e2e/scripts/ci-maestro-plan.mjs'),
        '--suite',
        suite,
        '--all',
        '--format',
        'json',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    return JSON.parse(result.stdout) as Array<{
      flow: string;
      scenario: string | null;
      shard: number;
    }>;
  }

  function runStartApiScript(script: string, useV2Fixture: boolean) {
    const root = mkdtempSync(join(tmpdir(), 'wi-2215-api-start-'));
    const binDir = join(root, 'bin');
    const pnpmMarker = join(root, 'pnpm-argv');
    const pnpm = join(binDir, 'pnpm');
    const curl = join(binDir, 'curl');

    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      pnpm,
      [
        '#!/usr/bin/env bash',
        'printf \'%s\\n\' "$@" > "$FAKE_PNPM_MARKER"',
        '',
      ].join('\n'),
    );
    writeFileSync(
      curl,
      [
        '#!/usr/bin/env bash',
        'for _ in {1..100}; do',
        '  if [ -s "$FAKE_PNPM_MARKER" ]; then exit 0; fi',
        '  sleep 0.01',
        'done',
        'exit 1',
        '',
      ].join('\n'),
    );
    chmodSync(pnpm, 0o755);
    chmodSync(curl, 0o755);

    try {
      const result = spawnSync(
        'bash',
        ['-e', '-u', '-o', 'pipefail', '-c', script],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH ?? ''}`,
            BASH_ENV: '',
            FAKE_PNPM_MARKER: pnpmMarker,
            USE_MAESTRO_V2_FIXTURE: useV2Fixture ? 'true' : 'false',
          },
        },
      );
      const pnpmArgv = existsSync(pnpmMarker)
        ? readFileSync(pnpmMarker, 'utf8').trim().split('\n')
        : [];
      return { result, pnpmArgv };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('declares recursive workspace discovery instead of the root-only default', () => {
    expect(workspaceConfig.flows).toContain('flows/**');
  });

  it('uses a sharded suite plan instead of passing a root-only folder to Maestro', () => {
    const runnerStep = mobileMaestro.steps?.find((step) =>
      String(step.uses ?? '').startsWith(
        'reactivecircus/android-emulator-runner@',
      ),
    );
    const runnerEnv = (runnerStep?.env ?? {}) as Record<string, unknown>;
    const strategy = (mobileMaestro.strategy ?? {}) as Record<string, unknown>;

    expect(strategy.matrix).toBeDefined();
    expect(runnerEnv.MAESTRO_CI_SUITE).toBeDefined();
    expect(runnerEnv.MAESTRO_CI_SHARD).toBeDefined();
    expect(runnerEnv.MAESTRO_INCLUDE_TAGS).toBeUndefined();

    const runner = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/scripts/run-ci-maestro.sh'),
      'utf8',
    );
    expect(runner).toContain('ci-maestro-plan.mjs');
    expect(runner).not.toMatch(/maestro test apps\/mobile\/e2e\/flows\//);
  });

  it('executes every planned shard entry even when Maestro consumes stdin', () => {
    const harness = createMaestroHarness(0);
    const expectedFlows = loadPlan('pr').filter(
      (entry) => entry.shard === 1,
    ).length;

    try {
      const result = runCiMaestro(harness, {
        FAKE_MAESTRO_DRAIN_STDIN: '1',
      });
      const invocations = readFileSync(harness.maestroMarker, 'utf8')
        .trim()
        .split('\n');

      expect(result.status).toBe(0);
      expect(invocations).toHaveLength(expectedFlows);
    } finally {
      rmSync(harness.root, { recursive: true, force: true });
    }
  });

  it('executes every planned shard entry even when adb consumes stdin', () => {
    const harness = createMaestroHarness(0);
    const expectedFlows = loadPlan('pr').filter(
      (entry) => entry.shard === 1,
    ).length;

    try {
      const result = runCiMaestro(harness, {
        FAKE_ADB_DRAIN_STDIN: '1',
      });
      const invocations = readFileSync(harness.maestroMarker, 'utf8')
        .trim()
        .split('\n');

      expect(result.status).toBe(0);
      expect(invocations).toHaveLength(expectedFlows);
    } finally {
      rmSync(harness.root, { recursive: true, force: true });
    }
  });

  it('boots an embedded test release APK instead of the dev-client launcher', () => {
    const cacheStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Cache E2E release APK',
    );
    const buildStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Build E2E release APK',
    );
    const ndkStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Install Android NDK with retry',
    );
    const manualBundleStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Bundle JS for cached APK',
    );
    const routerPatchStep = mobileMaestro.steps?.find(
      (step) =>
        step.name === 'Patch expo-router context files for offline bundling',
    );
    const workflowScripts = (mobileMaestro.steps ?? [])
      .map((step) => (typeof step.run === 'string' ? step.run : ''))
      .join('\n');
    const runner = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/scripts/run-ci-maestro.sh'),
      'utf8',
    );

    expect(mobileMaestro.env?.NODE_ENV).toBe('test');
    expect(mobileMaestro.env?.EXPO_PUBLIC_E2E).toBe('true');
    expect(mobileMaestro.env?.EXPO_PUBLIC_API_URL).toBe('http://10.0.2.2:8787');
    expect(cacheStep?.with).toMatchObject({
      path: 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk',
    });
    expect(String((cacheStep?.with as Record<string, unknown>)?.key)).toContain(
      'apk-e2e-release-',
    );
    expect(String(buildStep?.run)).toContain('assembleRelease');
    expect(String(buildStep?.run)).toContain('-Xmx4096m');
    expect(String(buildStep?.run)).toContain('--max-workers=2');
    expect(String(buildStep?.run)).not.toContain(
      '-x createBundleReleaseJsAndAssets',
    );
    expect(String(ndkStep?.run)).toContain('for attempt in 1 2 3');
    expect(String(ndkStep?.run)).toContain(
      '"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --install "ndk;27.1.12297006"',
    );
    expect(String(ndkStep?.run)).toContain('"ndk;27.0.12077973"');
    expect(manualBundleStep?.if).toBe(
      "steps.apk-cache.outputs.cache-hit == 'true'",
    );
    expect(manualBundleStep?.env).toMatchObject({ NODE_ENV: 'production' });
    expect(buildStep?.env).toMatchObject({ NODE_ENV: 'production' });
    expect(routerPatchStep).toBeUndefined();
    expect(workflowScripts).not.toContain('EXPO_ROUTER_APP_ROOT');
    expect(workflowScripts).not.toContain('assembleDebug');
    expect(runner).toContain(
      'android/app/build/outputs/apk/release/app-release.apk',
    );
    expect(runner).toContain('adb logcat -c');
    expect(runner).toContain(
      'adb shell am start -W -n "$APP_ID/.MainActivity"',
    );
    expect(runner).toContain('wait_for_entry_screen');
    expect(runner).toContain('launch-logcat.txt');
    expect(runner).not.toContain(
      'android/app/build/outputs/apk/debug/app-debug.apk',
    );

    const appLaunchFlow = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/app-launch.yaml'),
      'utf8',
    );
    expect(appLaunchFlow).toContain('_setup/nav-welcome-to-sign-in.yaml');
  });

  it('gives the local seed API the staging Clerk credentials needed for real sign-in users', () => {
    const installDopplerStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Install Doppler CLI',
    );
    const writeVarsStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Write wrangler .dev.vars for API',
    );
    const writeVarsEnv = (writeVarsStep?.env ?? {}) as Record<string, unknown>;
    const writeVarsScript = String(writeVarsStep?.run ?? '');

    expect(String(installDopplerStep?.run)).toContain('DOPPLER_VERSION=');
    expect(String(installDopplerStep?.run)).toContain('sha256sum -c -');
    expect(writeVarsEnv.DOPPLER_TOKEN).toBe('${{ secrets.DOPPLER_TOKEN_STG }}');
    expect(writeVarsScript).toContain('doppler run -p mentomate -c stg');
    expect(writeVarsScript).toContain('CLERK_SECRET_KEY');
    expect(writeVarsScript).toContain('CLERK_JWKS_URL');
    expect(writeVarsScript).toContain('CLERK_AUDIENCE');
    expect(writeVarsScript).toContain('SEED_PASSWORD');
    expect(writeVarsScript).toContain('TEST_SEED_SECRET');
    expect(writeVarsScript).not.toContain('${{ secrets.');
  });

  it('selects the tested Photosynthesis worker when USE_MAESTRO_V2_FIXTURE is true', () => {
    const startApiStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Start API server (background)',
    );
    const startApiScript = String(startApiStep?.run ?? '');

    expect(startApiStep).toBeDefined();
    const { result, pnpmArgv } = runStartApiScript(startApiScript, true);
    expect(result.status).toBe(0);
    expect(pnpmArgv).toEqual([
      '--dir',
      'apps/api',
      'exec',
      'wrangler',
      'dev',
      'src/test-utils/maestro-e2e-worker.ts',
    ]);
  });

  it('keeps ordinary Wrangler startup when USE_MAESTRO_V2_FIXTURE is false', () => {
    const startApiStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Start API server (background)',
    );
    const startApiScript = String(startApiStep?.run ?? '');

    const { result, pnpmArgv } = runStartApiScript(startApiScript, false);
    expect(result.status).toBe(0);
    expect(pnpmArgv).toEqual(['--dir', 'apps/api', 'exec', 'wrangler', 'dev']);
  });

  it('allows the release APK to reach the local HTTP API only in E2E builds', () => {
    const appConfig = JSON.parse(
      readFileSync(join(repoRoot, 'apps/mobile/app.json'), 'utf8'),
    ) as { expo: { plugins: Array<string | [string, unknown]> } };
    const pluginNames = appConfig.expo.plugins.map((plugin) =>
      Array.isArray(plugin) ? plugin[0] : plugin,
    );
    const {
      applyE2ECleartextPolicy,
    } = require('../apps/mobile/plugins/withE2ECleartextForTests');

    expect(pluginNames).toContain('./plugins/withE2ECleartextForTests');

    const productionManifest = {
      application: [{ $: { 'android:usesCleartextTraffic': 'true' } }],
    };
    applyE2ECleartextPolicy(productionManifest, false);
    expect(
      productionManifest.application[0].$['android:usesCleartextTraffic'],
    ).toBeUndefined();

    const e2eManifest = { application: [{ $: {} }] };
    applyE2ECleartextPolicy(e2eManifest, true);
    expect(e2eManifest.application[0].$['android:usesCleartextTraffic']).toBe(
      'true',
    );
  });

  it('keeps every pr-blocking flow in the explicit PR plan', () => {
    const plan = loadPlan('pr');

    expect(plan).toHaveLength(13);
    expect(plan.map(({ flow }) => flow)).toContain(
      'flows/account/more-tab-navigation.yaml',
    );
    expect(new Set(plan.map(({ flow }) => flow)).size).toBe(plan.length);
  });

  it('discovers the full scheduled tag set, including parent subdirectories', () => {
    const plan = loadPlan('nightly');

    expect(plan.length).toBeGreaterThan(100);
    expect(plan.some(({ flow }) => flow.startsWith('flows/parent/'))).toBe(
      true,
    );
    expect(plan.map(({ flow }) => flow)).not.toContain(
      'flows/consent/consent-deny-confirmation.yaml',
    );
    expect(plan.map(({ flow }) => flow)).not.toContain(
      'flows/edge/animated-splash.yaml',
    );
    expect(plan.every(({ shard }) => shard >= 1 && shard <= 8)).toBe(true);
  });

  it('[WI-1406] keeps native MFA placeholders explicitly non-executable until OPQ-26 fixtures exist', () => {
    const nightlyFlows = new Set(loadPlan('nightly').map(({ flow }) => flow));
    const placeholders = [
      'flows/auth/sign-in-mfa-email-code.yaml',
      'flows/auth/sign-in-mfa-totp.yaml',
      'flows/auth/sign-in-mfa-phone.yaml',
      'flows/auth/sign-in-mfa-backup-code.yaml',
    ];

    for (const flow of placeholders) {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e', flow),
        'utf8',
      );
      const header = parseYaml(source.split(/^---$/m)[0] ?? '') as {
        tags?: string[];
      };

      expect(header.tags).toEqual(
        expect.arrayContaining(['auth', 'blocked', 'manual']),
      );
      expect(source).toContain('OPQ-26');
      expect(nightlyFlows).not.toContain(flow);
    }
  });

  it('keeps V2-tagged Maestro flows and the V2 manifest bidirectionally discoverable', () => {
    const e2eRoot = join(repoRoot, 'apps/mobile/e2e');
    const flowsRoot = join(e2eRoot, 'flows');
    const manifest = JSON.parse(
      readFileSync(join(e2eRoot, 'ci-maestro-manifest.json'), 'utf8'),
    ) as { v2: Array<{ flow: string }> };
    const walkYaml = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return walkYaml(path);
        return /\.ya?ml$/.test(entry.name) ? [path] : [];
      });
    const taggedV2 = walkYaml(flowsRoot)
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        const header = parseYaml(source.split(/^---$/m)[0] ?? '') as {
          tags?: string[];
        };
        return header.tags?.includes('v2');
      })
      .map((path) => relative(e2eRoot, path).replaceAll('\\', '/'))
      .sort();
    const manifestV2 = manifest.v2.map(({ flow }) => flow).sort();

    expect(
      loadPlan('v2')
        .map(({ flow }) => flow)
        .sort(),
    ).toEqual(manifestV2);
    expect(taggedV2).toEqual(manifestV2);
  });

  it('[WI-1400] defines a V2-only native publish-readiness suite with interaction coverage', () => {
    const plan = loadPlan('v2');
    const workflowRaw = loadWorkflowRaw('e2e-ci.yml');
    const flow = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/v2/v2-shell-navigation.yaml'),
      'utf8',
    );
    const signInSetup = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/_setup/seed-and-sign-in.yaml'),
      'utf8',
    );
    const conventions = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/CONVENTIONS.md'),
      'utf8',
    );

    expect(plan).toEqual([
      {
        flow: 'flows/v2/v2-shell-navigation.yaml',
        scenario: 'learning-active',
        shard: 1,
      },
      {
        flow: 'flows/v2/v2-subject-create-round-trip.yaml',
        scenario: 'onboarding-no-subject',
        shard: 1,
      },
      {
        flow: 'flows/v2/v2-subjects-browse-resume.yaml',
        scenario: 'learning-active',
        shard: 1,
      },
      {
        flow: 'flows/v2/v2-subjects-due-review.yaml',
        scenario: 'retention-due',
        shard: 1,
      },
      // [WI-2241] Supporter scope journey — Support hub -> person scope ->
      // Mentor -> Subjects -> Journal -> Support hub, structural/negative
      // walls, empty-record honest-empty-state, revoked-edge affordance
      // absence, and a mid-flow relaunch.
      {
        flow: 'flows/v2/v2-supporter-scope-journey.yaml',
        scenario: 'v2-supporter-accepted',
        shard: 1,
      },
    ]);
    expect(workflowRaw).toContain('- v2');
    expect(workflowRaw).toContain('EXPO_PUBLIC_ENABLE_MODE_NAV_V2:');
    expect(workflowRaw).toContain("inputs.maestro_suite == 'v2'");
    expect(signInSetup).toMatch(/id: ['"]mentor-screen['"]/);
    expect(conventions).toContain('`v2`');

    for (const selector of [
      'tab-mentor',
      'tab-subjects',
      'tab-journal',
      'mentor-screen',
      'mentor-bar-homework-chip',
      'camera-view',
      'close-button',
      'subjects-screen',
      'subjects-browse-row-${SUBJECT_ID}',
      'subject-hub-screen',
      'journal-screen',
      'journal-tab-practice',
      'journal-practice-section',
      'journal-practice-open-hub',
      'practice-screen',
      'practice-back',
    ]) {
      expect(flow).toContain(selector);
    }
    for (const legacyTab of [
      'tab-home',
      'tab-my-learning',
      'tab-library',
      'tab-recaps',
      'tab-progress',
      'tab-more',
    ]) {
      expect(flow).toMatch(new RegExp(`id: ['"]${legacyTab}['"]`));
    }
    expect(flow.match(/assertNotVisible:/g)).toHaveLength(6);
    expect(flow.match(/id: ['"]tab-subjects['"]/g)).toHaveLength(3);
    expect(flow.match(/retryTapIfNoChange: true/g)).toHaveLength(3);
  });

  it('[WI-2238] binds exact case properties to their ID-bearing owners', () => {
    type Selector = Record<string, unknown>;
    const includesSelectorProperties = (
      actual: unknown,
      expected: Selector,
    ): boolean =>
      actual !== null &&
      typeof actual === 'object' &&
      Object.entries(expected).every(
        ([key, value]) => (actual as Selector)[key] === value,
      );
    const hasHardOwnedAssertion = (
      value: unknown,
      ownerId: string,
      descendants: Selector[],
    ): boolean => {
      if (Array.isArray(value)) {
        return value.some((entry) =>
          hasHardOwnedAssertion(entry, ownerId, descendants),
        );
      }
      if (value === null || typeof value !== 'object') return false;

      const record = value as Record<string, unknown>;
      const asserted = record.assertVisible;
      if (asserted !== null && typeof asserted === 'object') {
        const selector = asserted as Selector;
        const actualDescendants = selector.containsDescendants;
        if (
          selector.id === ownerId &&
          selector.optional !== true &&
          Array.isArray(actualDescendants) &&
          descendants.every((expected) =>
            actualDescendants.some((actual) =>
              includesSelectorProperties(actual, expected),
            ),
          )
        ) {
          return true;
        }
      }

      return Object.values(record).some((entry) =>
        hasHardOwnedAssertion(entry, ownerId, descendants),
      );
    };
    const hasHardIdAssertion = (value: unknown, ownerId: string): boolean => {
      if (Array.isArray(value)) {
        return value.some((entry) => hasHardIdAssertion(entry, ownerId));
      }
      if (value === null || typeof value !== 'object') return false;

      const record = value as Record<string, unknown>;
      const asserted = record.assertVisible;
      if (asserted !== null && typeof asserted === 'object') {
        const selector = asserted as Selector;
        if (selector.id === ownerId && selector.optional !== true) return true;
      }

      return Object.values(record).some((entry) =>
        hasHardIdAssertion(entry, ownerId),
      );
    };
    const hasRunFlowWithEnv = (
      value: unknown,
      file: string,
      expectedEnv: Selector,
    ): boolean => {
      if (Array.isArray(value)) {
        return value.some((entry) =>
          hasRunFlowWithEnv(entry, file, expectedEnv),
        );
      }
      if (value === null || typeof value !== 'object') return false;

      const record = value as Record<string, unknown>;
      const runFlow = record.runFlow;
      if (runFlow !== null && typeof runFlow === 'object') {
        const command = runFlow as Record<string, unknown>;
        const env = command.env;
        if (
          command.file === file &&
          env !== null &&
          typeof env === 'object' &&
          Object.entries(expectedEnv).every(
            ([key, expected]) =>
              (env as Record<string, unknown>)[key] === expected,
          )
        ) {
          return true;
        }
      }

      return Object.values(record).some((entry) =>
        hasRunFlowWithEnv(entry, file, expectedEnv),
      );
    };
    const hasExactCommandSequence = (
      value: unknown,
      expected: Selector[],
    ): boolean =>
      Array.isArray(value) &&
      expected.length > 0 &&
      value.some((_, start) =>
        expected.every(
          (command, offset) =>
            JSON.stringify(value[start + offset]) === JSON.stringify(command),
        ),
      );
    const loadCommands = (...segments: string[]): unknown =>
      parseAllDocuments(
        readFileSync(
          join(repoRoot, 'apps/mobile/e2e/flows', ...segments),
          'utf8',
        ),
      )[1]?.toJS();

    const resume = loadCommands('v2', 'v2-subjects-browse-resume.yaml');
    const dueReview = loadCommands('v2', 'v2-subjects-due-review.yaml');
    const subjectCreate = loadCommands(
      'v2',
      'v2-subject-create-round-trip.yaml',
    );
    const profileIdentity = loadCommands(
      '_setup',
      'assert-v2-active-profile-and-return.yaml',
    );

    const impossibleSearchAbsence: Selector[] = [
      { tapOn: { id: 'subjects-browse-search' } },
      { inputText: 'zzzz-no-such-subject-2238' },
      {
        extendedWaitUntil: {
          visible: { id: 'library-search-empty' },
          timeout: 15000,
        },
      },
      {
        assertNotVisible: {
          id: 'subjects-browse-row-${SUBJECT_ID}',
        },
      },
      { tapOn: { id: 'library-search-clear-results' } },
    ];
    const exactWorldHistoryRestore: Selector[] = [
      ...impossibleSearchAbsence,
      {
        extendedWaitUntil: {
          visible: { id: 'subjects-browse-row-${SUBJECT_ID}' },
          timeout: 15000,
        },
      },
      {
        assertVisible: {
          id: 'subjects-browse-row-${SUBJECT_ID}',
          containsDescendants: [{ text: '^World History$' }],
        },
      },
    ];
    const exactWorldHistoryHubTitle: Selector = {
      assertVisible: {
        id: 'subject-hub-title-${SUBJECT_ID}',
        text: '^World History$',
      },
    };
    const exactHubEntry: Selector[] = [
      { tapOn: { id: 'subjects-browse-row-${SUBJECT_ID}' } },
      {
        extendedWaitUntil: {
          visible: { id: 'subject-hub-screen' },
          timeout: 15000,
        },
      },
      exactWorldHistoryHubTitle,
    ];
    const exactPostSheetCloseHub: Selector[] = [
      { tapOn: { id: 'subject-hub-topic-sheet-close' } },
      { assertNotVisible: { id: 'subject-hub-topic-sheet' } },
      { assertVisible: { id: 'subject-hub-screen' } },
      exactWorldHistoryHubTitle,
    ];

    expect(hasExactCommandSequence(resume, exactWorldHistoryRestore)).toBe(
      true,
    );
    const titleCheckpointMutations = (checkpoint: Selector[]): Selector[][] => {
      const titleIndex = checkpoint.findIndex((command) =>
        isDeepStrictEqual(command, exactWorldHistoryHubTitle),
      );
      if (titleIndex < 0) {
        throw new Error('Subject Hub checkpoint is missing its exact title');
      }
      const replaceTitle = (titleSelector: Selector): Selector[] =>
        checkpoint.with(titleIndex, { assertVisible: titleSelector });

      return [
        checkpoint.filter((_, index) => index !== titleIndex),
        replaceTitle({
          id: 'subject-hub-screen',
          containsDescendants: [{ text: '^World History$' }],
        }),
        replaceTitle({
          id: 'subject-hub-title-adjacent-subject',
          text: '^World History$',
        }),
        replaceTitle({
          id: 'subject-hub-title-${SUBJECT_ID}',
          text: '^Adjacent History$',
        }),
        replaceTitle({
          id: 'subject-hub-title-${SUBJECT_ID}',
          text: '^World History$',
          optional: true,
        }),
        [
          ...checkpoint.slice(0, titleIndex),
          { assertVisible: { id: 'subject-hub-title-${SUBJECT_ID}' } },
          { assertVisible: { text: '^World History$' } },
          ...checkpoint.slice(titleIndex + 1),
        ],
      ];
    };
    for (const checkpoint of [exactHubEntry, exactPostSheetCloseHub]) {
      expect(hasExactCommandSequence(resume, checkpoint)).toBe(true);
      for (const mutation of titleCheckpointMutations(checkpoint)) {
        expect(hasExactCommandSequence(mutation, checkpoint)).toBe(false);
      }
    }
    for (const mutation of [
      // No-result row-absence removal.
      exactWorldHistoryRestore.filter((_, index) => index !== 3),
      // No-result row-absence optionalization.
      exactWorldHistoryRestore.with(3, {
        assertNotVisible: {
          id: 'subjects-browse-row-${SUBJECT_ID}',
          optional: true,
        },
      }),
      // No-result row-absence wrong owner.
      exactWorldHistoryRestore.with(3, {
        assertNotVisible: { id: 'subjects-browse-row-adjacent' },
      }),
      // No-result row-absence reordering after the recovery action.
      exactWorldHistoryRestore
        .with(3, exactWorldHistoryRestore[4]!)
        .with(4, exactWorldHistoryRestore[3]!),
      // Exact restored-row assertion removal.
      exactWorldHistoryRestore.filter((_, index) => index !== 6),
      // Exact restored-row assertion optionalization.
      exactWorldHistoryRestore.with(6, {
        assertVisible: {
          id: 'subjects-browse-row-${SUBJECT_ID}',
          containsDescendants: [{ text: '^World History$' }],
          optional: true,
        },
      }),
      // Exact restored-row wrong owner.
      exactWorldHistoryRestore.with(6, {
        assertVisible: {
          id: 'subjects-browse-row-adjacent',
          containsDescendants: [{ text: '^World History$' }],
        },
      }),
      // Exact restored-row wrong name.
      exactWorldHistoryRestore.with(6, {
        assertVisible: {
          id: 'subjects-browse-row-${SUBJECT_ID}',
          containsDescendants: [{ text: '^Adjacent History$' }],
        },
      }),
      // Exact restored-row wait/assertion reordering.
      exactWorldHistoryRestore
        .with(5, exactWorldHistoryRestore[6]!)
        .with(6, exactWorldHistoryRestore[5]!),
    ]) {
      expect(hasExactCommandSequence(mutation, exactWorldHistoryRestore)).toBe(
        false,
      );
    }
    for (const mutation of [
      // Topic-sheet absence removal.
      exactPostSheetCloseHub.filter((_, index) => index !== 1),
      // Topic-sheet absence optionalization.
      exactPostSheetCloseHub.with(1, {
        assertNotVisible: {
          id: 'subject-hub-topic-sheet',
          optional: true,
        },
      }),
      // Topic-sheet absence wrong owner.
      exactPostSheetCloseHub.with(1, {
        assertNotVisible: { id: 'subject-hub-screen' },
      }),
      // Topic-sheet absence reordering after the next Subject Hub assertion.
      exactPostSheetCloseHub
        .with(1, exactPostSheetCloseHub[2]!)
        .with(2, exactPostSheetCloseHub[1]!),
      // Exact title reordering before Subject Hub readiness.
      exactPostSheetCloseHub
        .with(2, exactPostSheetCloseHub[3]!)
        .with(3, exactPostSheetCloseHub[2]!),
    ]) {
      expect(hasExactCommandSequence(mutation, exactPostSheetCloseHub)).toBe(
        false,
      );
    }

    expect(Array.isArray(subjectCreate)).toBe(true);
    if (!Array.isArray(subjectCreate)) {
      throw new Error('V2 subject-create Maestro commands must be a YAML list');
    }
    const initialSubjectsReady = subjectCreate.findIndex(
      (command) =>
        JSON.stringify(command) ===
        JSON.stringify({
          extendedWaitUntil: {
            visible: { id: 'subjects-screen' },
            timeout: 15000,
          },
        }),
    );
    expect(initialSubjectsReady).toBeGreaterThanOrEqual(0);
    expect(
      subjectCreate.slice(initialSubjectsReady + 1, initialSubjectsReady + 3),
    ).toEqual([
      { assertVisible: { id: 'subjects-browse-empty' } },
      { assertNotVisible: { id: 'subjects-browse-row-.*' } },
    ]);

    const exactPhotosynthesisRow: Selector = {
      assertVisible: {
        id: 'subjects-browse-row-.*',
        containsDescendants: [{ text: '^Photosynthesis$' }],
      },
    };
    const exactCreatedSubjectReturn: Selector[] = [
      {
        extendedWaitUntil: {
          visible: {
            id: 'subjects-browse-row-.*',
            containsDescendants: [{ text: '^Photosynthesis$' }],
          },
          timeout: 15000,
        },
      },
      exactPhotosynthesisRow,
      {
        runFlow: {
          file: '../_setup/assert-v2-active-profile-and-return.yaml',
          env: {
            PROFILE_ID: '${PROFILE_ID}',
            PROFILE_NAME: 'Test Learner',
            RETURN_SCREEN_ID: 'subjects-screen',
            RETURN_ROW_ID: 'subjects-browse-row-.*',
            RETURN_ROW_NAME: 'Photosynthesis',
          },
        },
      },
    ];
    const exactActiveProfileReturn: Selector[] = [
      {
        assertVisible: {
          id: 'profile-row-${PROFILE_ID}',
          containsDescendants: [
            { text: '^${PROFILE_NAME}$' },
            { id: 'profile-active-check' },
          ],
        },
      },
      { tapOn: { id: 'profiles-close' } },
      {
        extendedWaitUntil: {
          visible: { id: 'account-admin-sheet' },
          timeout: 10000,
        },
      },
      {
        assertVisible: {
          id: 'account-admin-sheet',
          containsDescendants: [{ text: '^${PROFILE_NAME}$' }],
        },
      },
      { tapOn: { id: 'account-back' } },
      {
        extendedWaitUntil: {
          visible: { id: '${RETURN_SCREEN_ID}' },
          timeout: 15000,
        },
      },
      { assertVisible: { id: '${RETURN_SCREEN_ID}' } },
      {
        assertVisible: {
          id: '${RETURN_ROW_ID}',
          containsDescendants: [{ text: '^${RETURN_ROW_NAME}$' }],
        },
      },
    ];
    const hasExactCreatedSubjectIdentityReturn = (
      subjectCommands: unknown,
      identityCommands: unknown,
    ): boolean =>
      hasExactCommandSequence(subjectCommands, exactCreatedSubjectReturn) &&
      hasExactCommandSequence(identityCommands, exactActiveProfileReturn);
    expect(
      hasExactCreatedSubjectIdentityReturn(subjectCreate, profileIdentity),
    ).toBe(true);

    const replaceCreatedReturn = (
      index: number,
      replacement: Selector[],
    ): Selector[] => [
      ...exactCreatedSubjectReturn.slice(0, index),
      ...replacement,
      ...exactCreatedSubjectReturn.slice(index + 1),
    ];
    for (const mutation of [
      // Global text can be rendered outside the created Subject row.
      replaceCreatedReturn(1, [
        { assertVisible: { text: '^Photosynthesis$' } },
      ]),
      // Split sibling assertions do not prove the name belongs to the row.
      replaceCreatedReturn(1, [
        { assertVisible: { id: 'subjects-browse-row-.*' } },
        { assertVisible: { text: '^Photosynthesis$' } },
      ]),
      // Optional row evidence does not establish the guaranteed property.
      replaceCreatedReturn(1, [
        {
          assertVisible: {
            id: 'subjects-browse-row-.*',
            containsDescendants: [{ text: '^Photosynthesis$' }],
            optional: true,
          },
        },
      ]),
      // The correct owner with an adjacent name proves the wrong case.
      replaceCreatedReturn(1, [
        {
          assertVisible: {
            id: 'subjects-browse-row-.*',
            containsDescendants: [{ text: '^Biology$' }],
          },
        },
      ]),
      // The active seeded learner must be verified after the return.
      exactCreatedSubjectReturn.slice(0, -1),
    ]) {
      expect(
        hasExactCreatedSubjectIdentityReturn(mutation, profileIdentity),
      ).toBe(false);
    }

    const replaceActiveProfileReturn = (
      index: number,
      replacement: Selector[],
    ): Selector[] => [
      ...exactActiveProfileReturn.slice(0, index),
      ...replacement,
      ...exactActiveProfileReturn.slice(index + 1),
    ];
    for (const mutation of [
      // Removing the active-profile property leaves the named learner unproved.
      exactActiveProfileReturn.slice(1),
      // Optional identity evidence does not establish the guaranteed property.
      replaceActiveProfileReturn(0, [
        {
          assertVisible: {
            id: 'profile-row-${PROFILE_ID}',
            containsDescendants: [
              { text: '^${PROFILE_NAME}$' },
              { id: 'profile-active-check' },
            ],
            optional: true,
          },
        },
      ]),
      // An adjacent profile row cannot own the active Test Learner evidence.
      replaceActiveProfileReturn(0, [
        {
          assertVisible: {
            id: 'profile-row-adjacent',
            containsDescendants: [
              { text: '^${PROFILE_NAME}$' },
              { id: 'profile-active-check' },
            ],
          },
        },
      ]),
      // The correct profile row with an adjacent name proves the wrong case.
      replaceActiveProfileReturn(0, [
        {
          assertVisible: {
            id: 'profile-row-${PROFILE_ID}',
            containsDescendants: [
              { text: '^Adjacent Learner$' },
              { id: 'profile-active-check' },
            ],
          },
        },
      ]),
      // Identity must be established before the return navigation begins.
      exactActiveProfileReturn
        .with(0, exactActiveProfileReturn[1]!)
        .with(1, exactActiveProfileReturn[0]!),
      // Removing the returned row loses the post-return Photosynthesis proof.
      exactActiveProfileReturn.slice(0, -1),
      // Optional returned-row evidence does not establish the property.
      replaceActiveProfileReturn(7, [
        {
          assertVisible: {
            id: '${RETURN_ROW_ID}',
            containsDescendants: [{ text: '^${RETURN_ROW_NAME}$' }],
            optional: true,
          },
        },
      ]),
      // The returned name must belong to the same row owner from the caller.
      replaceActiveProfileReturn(7, [
        {
          assertVisible: {
            id: 'subjects-browse-row-adjacent',
            containsDescendants: [{ text: '^${RETURN_ROW_NAME}$' }],
          },
        },
      ]),
      // The returned row must own the exact Photosynthesis case name.
      replaceActiveProfileReturn(7, [
        {
          assertVisible: {
            id: '${RETURN_ROW_ID}',
            containsDescendants: [{ text: '^Adjacent Science$' }],
          },
        },
      ]),
      // The owned row proof must follow restoration of its return screen.
      exactActiveProfileReturn
        .with(6, exactActiveProfileReturn[7]!)
        .with(7, exactActiveProfileReturn[6]!),
    ]) {
      expect(
        hasExactCreatedSubjectIdentityReturn(subjectCreate, mutation),
      ).toBe(false);
    }

    const expectedBindings: Array<[unknown, string, Selector[]]> = [
      [
        resume,
        'subjects-browse-row-${SUBJECT_ID}',
        [{ text: '^World History$' }],
      ],
      [
        resume,
        'subject-hub-topic-${TOPIC_ID}',
        [{ text: '^World History Topic 1$' }],
      ],
      [
        resume,
        'subject-hub-next-up',
        [
          { text: '^World History Topic 1$' },
          { id: 'subject-hub-next-up-action', text: '^Resume$' },
        ],
      ],
      [dueReview, 'subjects-browse-row-${SUBJECT_ID}', [{ text: '^Biology$' }]],
      [
        dueReview,
        'subject-hub-next-up',
        [
          { text: '^Biology Topic 1$' },
          { id: 'subject-hub-next-up-action', text: '^Review$' },
        ],
      ],
      [profileIdentity, 'account-admin-sheet', [{ text: '^${PROFILE_NAME}$' }]],
      [
        profileIdentity,
        'profile-row-${PROFILE_ID}',
        [{ text: '^${PROFILE_NAME}$' }, { id: 'profile-active-check' }],
      ],
      [profileIdentity, '${RETURN_ROW_ID}', [{ text: '^${RETURN_ROW_NAME}$' }]],
    ];

    for (const [commands, ownerId, descendants] of expectedBindings) {
      expect(hasHardOwnedAssertion(commands, ownerId, descendants)).toBe(true);
    }

    expect(hasHardIdAssertion(profileIdentity, '${RETURN_SCREEN_ID}')).toBe(
      true,
    );
    expect(
      hasRunFlowWithEnv(
        resume,
        '../_setup/assert-v2-active-profile-and-return.yaml',
        {
          PROFILE_ID: '${PROFILE_ID}',
          PROFILE_NAME: 'Active Learner',
          RETURN_SCREEN_ID: 'subjects-screen',
          RETURN_ROW_ID: 'subjects-browse-row-${SUBJECT_ID}',
          RETURN_ROW_NAME: 'World History',
        },
      ),
    ).toBe(true);
    expect(
      hasRunFlowWithEnv(
        dueReview,
        '../_setup/assert-v2-active-profile-and-return.yaml',
        {
          PROFILE_ID: '${PROFILE_ID}',
          PROFILE_NAME: 'Review Learner',
          RETURN_SCREEN_ID: 'subjects-screen',
          RETURN_ROW_ID: 'subjects-browse-row-${SUBJECT_ID}',
          RETURN_ROW_NAME: 'Biology',
        },
      ),
    ).toBe(true);

    const splitAcrossSiblings = [
      { assertVisible: { id: 'subjects-browse-row-${SUBJECT_ID}' } },
      { assertVisible: { text: '^World History$' } },
    ];
    expect(
      hasHardOwnedAssertion(
        splitAcrossSiblings,
        'subjects-browse-row-${SUBJECT_ID}',
        [{ text: '^World History$' }],
      ),
    ).toBe(false);

    const liftedToCommonAncestor = [
      {
        assertVisible: {
          id: 'subjects-screen',
          containsDescendants: [
            { id: 'subjects-browse-row-${SUBJECT_ID}' },
            { text: '^World History$' },
          ],
        },
      },
    ];
    expect(
      hasHardOwnedAssertion(
        liftedToCommonAncestor,
        'subjects-browse-row-${SUBJECT_ID}',
        [{ text: '^World History$' }],
      ),
    ).toBe(false);

    const adjacentSeedCase = [
      {
        assertVisible: {
          id: 'subject-hub-next-up',
          containsDescendants: [
            { text: '^Biology Topic 2$' },
            { id: 'subject-hub-next-up-action', text: '^Review$' },
          ],
        },
      },
    ];
    expect(
      hasHardOwnedAssertion(adjacentSeedCase, 'subject-hub-next-up', [
        { text: '^Biology Topic 1$' },
        { id: 'subject-hub-next-up-action', text: '^Review$' },
      ]),
    ).toBe(false);

    expect(
      hasRunFlowWithEnv(
        resume,
        '../_setup/assert-v2-active-profile-and-return.yaml',
        {
          PROFILE_ID: '${PROFILE_ID}',
          PROFILE_NAME: 'Adjacent Learner',
          RETURN_SCREEN_ID: 'subjects-screen',
          RETURN_ROW_ID: 'subjects-browse-row-${SUBJECT_ID}',
          RETURN_ROW_NAME: 'World History',
        },
      ),
    ).toBe(false);
  });

  it('[WI-2238] structurally binds the retention-due browser case to seed-owned IDs and the observed route', () => {
    const hasSeedOwnedRetentionRouteBinding = (source: string): boolean => {
      const sourceFile = ts.createSourceFile(
        'v2-subjects.spec.ts',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      let caseBody: ts.Block | undefined;

      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'test' &&
          ts.isStringLiteral(node.arguments[0]) &&
          node.arguments[0].text.startsWith('WI-2238 retention-due case:')
        ) {
          const callback = node.arguments[1];
          if (
            (ts.isArrowFunction(callback) ||
              ts.isFunctionExpression(callback)) &&
            ts.isBlock(callback.body)
          ) {
            caseBody = callback.body;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      if (!caseBody) return false;

      const compactBody = caseBody.getText(sourceFile).replace(/\s+/g, '');
      const hasBothSeedIds =
        compactBody.includes('constsubjectId=seed.ids.subjectId;') &&
        compactBody.includes('consttopicId=seed.ids.topicId;');
      const hasFailClosedIdGuard =
        compactBody.includes('if(!subjectId||!topicId){thrownewError(') ||
        compactBody.includes('if(!topicId||!subjectId){thrownewError(');
      const hasExactSubjectFlow =
        compactBody.includes(
          "awaitexpectSubjectRow(page,subjectId,'Biology');",
        ) &&
        compactBody.includes(
          'awaitpressableClick(page.getByTestId(`subjects-browse-row-${subjectId}`));',
        ) &&
        compactBody.includes(
          "awaitexpectSubjectHub(page,subjectId,'Biology');",
        );
      let hasObservedUrlPolling = false;
      const visitPoll = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'toEqual' &&
          ts.isCallExpression(node.expression.expression)
        ) {
          const pollCall = node.expression.expression;
          if (
            ts.isPropertyAccessExpression(pollCall.expression) &&
            ts.isIdentifier(pollCall.expression.expression) &&
            pollCall.expression.expression.text === 'expect' &&
            pollCall.expression.name.text === 'poll'
          ) {
            const callback = pollCall.arguments[0];
            if (
              (ts.isArrowFunction(callback) ||
                ts.isFunctionExpression(callback)) &&
              ts.isBlock(callback.body)
            ) {
              const urlDeclarations = callback.body.statements.flatMap(
                (statement) =>
                  ts.isVariableStatement(statement)
                    ? statement.declarationList.declarations.filter(
                        (declaration) =>
                          ts.isIdentifier(declaration.name) &&
                          declaration.name.text === 'url',
                      )
                    : [],
              );
              const urlDeclaration = urlDeclarations[0];
              const urlInitializer = urlDeclaration?.initializer;
              const pageUrlArgument =
                urlInitializer && ts.isNewExpression(urlInitializer)
                  ? urlInitializer.arguments?.[0]
                  : undefined;
              let hasUrlWrite = false;
              const visitUrlWrites = (candidate: ts.Node): void => {
                if (
                  ts.isBinaryExpression(candidate) &&
                  ts.isIdentifier(candidate.left) &&
                  candidate.left.text === 'url' &&
                  candidate.operatorToken.kind >=
                    ts.SyntaxKind.FirstAssignment &&
                  candidate.operatorToken.kind <= ts.SyntaxKind.LastAssignment
                ) {
                  hasUrlWrite = true;
                }
                if (
                  (ts.isPrefixUnaryExpression(candidate) ||
                    ts.isPostfixUnaryExpression(candidate)) &&
                  (candidate.operator === ts.SyntaxKind.PlusPlusToken ||
                    candidate.operator === ts.SyntaxKind.MinusMinusToken) &&
                  ts.isIdentifier(candidate.operand) &&
                  candidate.operand.text === 'url'
                ) {
                  hasUrlWrite = true;
                }
                ts.forEachChild(candidate, visitUrlWrites);
              };
              visitUrlWrites(callback.body);
              const hasExactObservedUrlBinding =
                urlDeclarations.length === 1 &&
                Boolean(
                  urlDeclaration &&
                  ts.isVariableDeclarationList(urlDeclaration.parent) &&
                  (urlDeclaration.parent.flags & ts.NodeFlags.Const) !== 0,
                ) &&
                !hasUrlWrite &&
                Boolean(
                  urlInitializer &&
                  ts.isNewExpression(urlInitializer) &&
                  ts.isIdentifier(urlInitializer.expression) &&
                  urlInitializer.expression.text === 'URL' &&
                  urlInitializer.arguments?.length === 1 &&
                  pageUrlArgument &&
                  ts.isCallExpression(pageUrlArgument) &&
                  pageUrlArgument.arguments.length === 0 &&
                  ts.isPropertyAccessExpression(pageUrlArgument.expression) &&
                  ts.isIdentifier(pageUrlArgument.expression.expression) &&
                  pageUrlArgument.expression.expression.text === 'page' &&
                  pageUrlArgument.expression.name.text === 'url',
                );
              const returnedObjects = callback.body.statements.flatMap(
                (statement) =>
                  ts.isReturnStatement(statement) &&
                  statement.expression &&
                  ts.isObjectLiteralExpression(statement.expression)
                    ? [statement.expression]
                    : [],
              );
              const returnedObject = returnedObjects[0];
              const hasExactPollStatements =
                callback.body.statements.length === 2 &&
                ts.isVariableStatement(callback.body.statements[0]) &&
                callback.body.statements[0].declarationList.declarations
                  .length === 1 &&
                callback.body.statements[0].declarationList.declarations[0] ===
                  urlDeclaration &&
                ts.isReturnStatement(callback.body.statements[1]) &&
                callback.body.statements[1].expression === returnedObject;
              const pathnameProperty = returnedObject?.properties.find(
                (property) =>
                  ts.isPropertyAssignment(property) &&
                  ts.isIdentifier(property.name) &&
                  property.name.text === 'pathname',
              );
              const subjectIdProperty = returnedObject?.properties.find(
                (property) =>
                  ts.isPropertyAssignment(property) &&
                  ts.isIdentifier(property.name) &&
                  property.name.text === 'subjectId',
              );
              const hasExactObservedReturn = Boolean(
                returnedObjects.length === 1 &&
                returnedObject?.properties.length === 2 &&
                returnedObject.properties.every((property) =>
                  ts.isPropertyAssignment(property),
                ) &&
                pathnameProperty &&
                ts.isPropertyAssignment(pathnameProperty) &&
                ts.isPropertyAccessExpression(pathnameProperty.initializer) &&
                ts.isIdentifier(pathnameProperty.initializer.expression) &&
                pathnameProperty.initializer.expression.text === 'url' &&
                pathnameProperty.initializer.name.text === 'pathname' &&
                subjectIdProperty &&
                ts.isPropertyAssignment(subjectIdProperty) &&
                ts.isCallExpression(subjectIdProperty.initializer) &&
                subjectIdProperty.initializer.arguments.length === 1 &&
                ts.isStringLiteral(
                  subjectIdProperty.initializer.arguments[0],
                ) &&
                subjectIdProperty.initializer.arguments[0].text ===
                  'subjectId' &&
                ts.isPropertyAccessExpression(
                  subjectIdProperty.initializer.expression,
                ) &&
                subjectIdProperty.initializer.expression.name.text === 'get' &&
                ts.isPropertyAccessExpression(
                  subjectIdProperty.initializer.expression.expression,
                ) &&
                ts.isIdentifier(
                  subjectIdProperty.initializer.expression.expression
                    .expression,
                ) &&
                subjectIdProperty.initializer.expression.expression.expression
                  .text === 'url' &&
                subjectIdProperty.initializer.expression.expression.name
                  .text === 'searchParams',
              );
              const compactExpected = node.arguments[0]
                ?.getText(sourceFile)
                .replace(/\s+/g, '');
              const hasExactExpectedUrl =
                compactExpected ===
                  '{pathname:`/topic/${topicId}`,subjectId}' ||
                compactExpected === '{pathname:`/topic/${topicId}`,subjectId,}';
              if (
                hasExactPollStatements &&
                hasExactObservedUrlBinding &&
                hasExactObservedReturn &&
                hasExactExpectedUrl
              ) {
                hasObservedUrlPolling = true;
              }
            }
          }
        }
        ts.forEachChild(node, visitPoll);
      };
      visitPoll(caseBody);

      return (
        hasBothSeedIds &&
        hasFailClosedIdGuard &&
        hasExactSubjectFlow &&
        hasObservedUrlPolling
      );
    };

    const exactBindingFixture = `
      test('WI-2238 retention-due case: exact seeded Topic fixture', async ({ page }) => {
        const seed = await seedAndSignIn(page, { scenario: 'retention-due' });
        const subjectId = seed.ids.subjectId;
        const topicId = seed.ids.topicId;
        if (!subjectId || !topicId) {
          throw new Error('retention-due seed did not return subjectId and topicId');
        }
        await expectSubjectRow(page, subjectId, 'Biology');
        await pressableClick(page.getByTestId(\`subjects-browse-row-\${subjectId}\`));
        await expectSubjectHub(page, subjectId, 'Biology');
        await expect.poll(() => {
          const url = new URL(page.url());
          return {
            pathname: url.pathname,
            subjectId: url.searchParams.get('subjectId'),
          };
        }).toEqual({
          pathname: \`/topic/\${topicId}\`,
          subjectId,
        });
      });
    `;
    expect(hasSeedOwnedRetentionRouteBinding(exactBindingFixture)).toBe(true);

    for (const mutation of [
      exactBindingFixture.replace(
        'const url = new URL(page.url());',
        "const url = new URL(page.url());\n          url.pathname = `/topic/${topicId}`;\n          url.searchParams.set('subjectId', subjectId);",
      ),
      exactBindingFixture.replace(
        'const url = new URL(page.url());',
        'let url = new URL(page.url());\n          url = new URL(`https://example.test/topic/${topicId}?subjectId=${subjectId}`);',
      ),
      exactBindingFixture.replace(
        "subjectId: url.searchParams.get('subjectId'),\n          };",
        "subjectId: url.searchParams.get('subjectId'),\n            ...{ pathname: `/topic/${topicId}`, subjectId },\n          };",
      ),
      exactBindingFixture.replace(
        'const url = new URL(page.url());',
        'const observedUrl = new URL(page.url());\n          const url = new URL(`https://example.test/topic/${topicId}?subjectId=${subjectId}`);',
      ),
      exactBindingFixture.replace(
        "return {\n            pathname: url.pathname,\n            subjectId: url.searchParams.get('subjectId'),\n          };",
        "const observedUrl = {\n            pathname: url.pathname,\n            subjectId: url.searchParams.get('subjectId'),\n          };\n          return { pathname: `/topic/${topicId}`, subjectId };",
      ),
      exactBindingFixture.replace(
        'const topicId = seed.ids.topicId;',
        "const topicId = 'adjacent-topic-id';",
      ),
      exactBindingFixture.replace(
        'if (!subjectId || !topicId)',
        'if (!subjectId)',
      ),
      exactBindingFixture.replace(
        'const url = new URL(page.url());',
        'const url = new URL(`https://example.test/topic/${topicId}?subjectId=${subjectId}`);',
      ),
      exactBindingFixture.replace(
        "expectSubjectRow(page, subjectId, 'Biology')",
        "expectSubjectRow(page, 'adjacent-subject-id', 'Biology')",
      ),
      exactBindingFixture.replace(
        'page.getByTestId(`subjects-browse-row-${subjectId}`)',
        "page.getByTestId('subjects-browse-row-adjacent-subject-id')",
      ),
      exactBindingFixture.replace(
        "expectSubjectHub(page, subjectId, 'Biology')",
        "expectSubjectHub(page, 'adjacent-subject-id', 'Biology')",
      ),
      exactBindingFixture.replace(
        'pathname: `/topic/${topicId}`',
        "pathname: '/topic/adjacent-topic-id'",
      ),
      exactBindingFixture.replace(
        'pathname: `/topic/${topicId}`,\n          subjectId,',
        "pathname: `/topic/${topicId}`,\n          subjectId: 'adjacent-subject-id',",
      ),
    ]) {
      expect(hasSeedOwnedRetentionRouteBinding(mutation)).toBe(false);
    }

    const subjectsSpec = readFileSync(
      join(repoRoot, 'apps/mobile/e2e-web/flows/v2/v2-subjects.spec.ts'),
      'utf8',
    );
    expect(hasSeedOwnedRetentionRouteBinding(subjectsSpec)).toBe(true);
  });

  it('[WI-2238] starts the self-seeded Playwright cases from empty storage', () => {
    const hasEmptyStorageStateBeforeCases = (source: string): boolean => {
      const sourceFile = ts.createSourceFile(
        'v2-subjects.spec.ts',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const hasPropertyName = (
        candidate: ts.ObjectLiteralElementLike,
        name: string,
      ): boolean => {
        if (!('name' in candidate)) return false;
        return (
          (ts.isIdentifier(candidate.name) && candidate.name.text === name) ||
          (ts.isStringLiteral(candidate.name) && candidate.name.text === name)
        );
      };
      const property = (
        object: ts.ObjectLiteralExpression,
        name: string,
      ): ts.PropertyAssignment | undefined =>
        object.properties.find(
          (candidate): candidate is ts.PropertyAssignment =>
            ts.isPropertyAssignment(candidate) &&
            hasPropertyName(candidate, name),
        );
      const hasOpaqueObjectProperties = (
        object: ts.ObjectLiteralExpression,
      ): boolean =>
        object.properties.some(
          (candidate) =>
            ts.isSpreadAssignment(candidate) ||
            ('name' in candidate && ts.isComputedPropertyName(candidate.name)),
        );
      const isTestUseCall = (
        expression: ts.Expression,
      ): expression is ts.CallExpression =>
        ts.isCallExpression(expression) &&
        ((ts.isPropertyAccessExpression(expression.expression) &&
          ts.isIdentifier(expression.expression.expression) &&
          expression.expression.expression.text === 'test' &&
          expression.expression.name.text === 'use') ||
          (ts.isElementAccessExpression(expression.expression) &&
            ts.isIdentifier(expression.expression.expression) &&
            expression.expression.expression.text === 'test' &&
            expression.expression.argumentExpression !== undefined &&
            (ts.isStringLiteral(expression.expression.argumentExpression) ||
              ts.isNoSubstitutionTemplateLiteral(
                expression.expression.argumentExpression,
              )) &&
            expression.expression.argumentExpression.text === 'use'));
      const isOpaqueComputedTestCall = (
        expression: ts.Expression,
      ): expression is ts.CallExpression =>
        ts.isCallExpression(expression) &&
        ts.isElementAccessExpression(expression.expression) &&
        ts.isIdentifier(expression.expression.expression) &&
        expression.expression.expression.text === 'test' &&
        !ts.isStringLiteral(expression.expression.argumentExpression) &&
        !ts.isNoSubstitutionTemplateLiteral(
          expression.expression.argumentExpression,
        );
      const storageStateInitializer = (
        expression: ts.Expression,
      ): ts.Expression | undefined => {
        if (!isTestUseCall(expression)) {
          return undefined;
        }

        const options = expression.arguments[0];
        if (!options || !ts.isObjectLiteralExpression(options)) {
          return undefined;
        }
        return property(options, 'storageState')?.initializer;
      };
      const firstCase = sourceFile.statements.findIndex(
        (statement) =>
          ts.isExpressionStatement(statement) &&
          ts.isCallExpression(statement.expression) &&
          ts.isIdentifier(statement.expression.expression) &&
          statement.expression.expression.text === 'test',
      );
      const emptyOverride = sourceFile.statements.findIndex((statement) => {
        if (!ts.isExpressionStatement(statement)) return false;
        const storageState = storageStateInitializer(statement.expression);
        if (!storageState || !ts.isObjectLiteralExpression(storageState)) {
          return false;
        }
        if (storageState.properties.length !== 2) return false;
        const cookiesProperty = property(storageState, 'cookies');
        const originsProperty = property(storageState, 'origins');
        const cookies = cookiesProperty?.initializer;
        const origins = originsProperty?.initializer;
        return (
          !!cookies &&
          ts.isArrayLiteralExpression(cookies) &&
          cookies.elements.length === 0 &&
          !!origins &&
          ts.isArrayLiteralExpression(origins) &&
          origins.elements.length === 0
        );
      });
      let storageOverrideCount = 0;
      let hasOpaqueTestUse = false;
      const countStorageOverrides = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && isOpaqueComputedTestCall(node)) {
          hasOpaqueTestUse = true;
        }
        if (ts.isCallExpression(node) && isTestUseCall(node)) {
          const options = node.arguments[0];
          if (!options || !ts.isObjectLiteralExpression(options)) {
            hasOpaqueTestUse = true;
          } else {
            if (hasOpaqueObjectProperties(options)) {
              hasOpaqueTestUse = true;
            }
            const storageProperties = options.properties.filter((candidate) =>
              hasPropertyName(candidate, 'storageState'),
            );
            storageOverrideCount += storageProperties.length;
            if (
              storageProperties.some(
                (candidate) =>
                  !ts.isPropertyAssignment(candidate) ||
                  (!ts.isObjectLiteralExpression(candidate.initializer) &&
                    !ts.isStringLiteral(candidate.initializer)) ||
                  (ts.isObjectLiteralExpression(candidate.initializer) &&
                    hasOpaqueObjectProperties(candidate.initializer)),
              )
            ) {
              hasOpaqueTestUse = true;
            }
          }
        }
        ts.forEachChild(node, countStorageOverrides);
      };
      countStorageOverrides(sourceFile);

      return (
        firstCase >= 0 &&
        emptyOverride >= 0 &&
        emptyOverride < firstCase &&
        storageOverrideCount === 1 &&
        !hasOpaqueTestUse
      );
    };
    const caseStub = "test('self-seeded case', async () => {});";

    expect(
      hasEmptyStorageStateBeforeCases(
        `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}`,
      ),
    ).toBe(true);
    for (const mutation of [
      caseStub,
      `test.use({ storageState: 'solo-learner.json' });\n${caseStub}`,
      `test.use({ storageState: { cookies: [{}], origins: [] } });\n${caseStub}`,
      `test.use({ storageState: { cookies: [], origins: [{}] } });\n${caseStub}`,
      `${caseStub}\ntest.use({ storageState: { cookies: [], origins: [] } });`,
      `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}\ntest.use({ storageState: 'solo-learner.json' });\n${caseStub}`,
      `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}\ntest.describe('authenticated', () => { test.use({ storageState: 'solo-learner.json' }); ${caseStub} });`,
      `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}\ntest['use']({ storageState: 'solo-learner.json' });\n${caseStub}`,
      `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}\ntest.describe('computed authenticated', () => { test['use']({ storageState: 'solo-learner.json' }); ${caseStub} });`,
      `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}\nconst method = 'use';\ntest[method]({ storageState: 'solo-learner.json' });\n${caseStub}`,
      `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}\nconst storageState = { cookies: [], origins: [] };\ntest.use({ storageState });\n${caseStub}`,
      `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}\nconst options = getTestOptions();\ntest.use(options);\n${caseStub}`,
      `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}\nconst options = getTestOptions();\ntest.use({ ...options });\n${caseStub}`,
      `test.use({ storageState: { cookies: [], origins: [] } });\n${caseStub}\nconst opaqueState = getStorageState();\ntest.use({ storageState: opaqueState });\n${caseStub}`,
      `const opaqueState = getStorageState();\ntest.use({ storageState: { ...opaqueState, cookies: [], origins: [] } });\n${caseStub}`,
    ]) {
      expect(hasEmptyStorageStateBeforeCases(mutation)).toBe(false);
    }

    const subjectsSpec = readFileSync(
      join(repoRoot, 'apps/mobile/e2e-web/flows/v2/v2-subjects.spec.ts'),
      'utf8',
    );
    expect(hasEmptyStorageStateBeforeCases(subjectsSpec)).toBe(true);
  });

  it('[WI-2506] binds each subject resolver result to its owned action and fails ambiguous results closed', () => {
    type Command = Record<string, unknown>;
    const subjectCreate = parseAllDocuments(
      readFileSync(
        join(
          repoRoot,
          'apps/mobile/e2e/flows/v2/v2-subject-create-round-trip.yaml',
        ),
        'utf8',
      ),
    )[1]?.toJS() as unknown;

    expect(Array.isArray(subjectCreate)).toBe(true);
    if (!Array.isArray(subjectCreate)) {
      throw new Error('V2 subject-create Maestro commands must be a YAML list');
    }

    const ownedBranch = (ownerId: string, actionId: string): Command[] => [
      {
        assertVisible: {
          id: ownerId,
          containsDescendants: [{ id: actionId }],
        },
      },
      {
        tapOn: {
          id: actionId,
          childOf: { id: ownerId },
        },
      },
    ];
    const branch = (triggerId: string, commands: Command[]): Command => ({
      runFlow: {
        when: { visible: { id: triggerId } },
        commands,
      },
    });
    const allObjects = (value: unknown): Command[] => {
      if (Array.isArray(value)) {
        return value.flatMap(allObjects);
      }
      if (value === null || typeof value !== 'object') return [];
      return [value as Command, ...Object.values(value).flatMap(allObjects)];
    };
    const resolveFinished: Command = {
      extendedWaitUntil: {
        notVisible: { id: 'subject-resolve-loading' },
        timeout: 60000,
      },
    };
    const failClosed: Command = {
      assertNotVisible: { id: 'subject-suggestion-card' },
    };
    const noMatchBranch = branch(
      'subject-no-match-card',
      ownedBranch('subject-no-match-card', 'subject-use-my-words'),
    );
    const readyHandoff: Command = {
      extendedWaitUntil: {
        visible: { id: 'ready-screen' },
        timeout: 60000,
      },
    };
    const outcomeSequence: Command[] = [
      resolveFinished,
      failClosed,
      branch(
        'subject-confident-card',
        ownedBranch('subject-confident-card', 'subject-suggestion-accept'),
      ),
      branch(
        'subject-single-suggestion-card',
        ownedBranch(
          'subject-single-suggestion-card',
          'subject-suggestion-accept',
        ),
      ),
      noMatchBranch,
      readyHandoff,
    ];
    const hasSequence = (
      commands: unknown[],
      expectedSequence: unknown[],
    ): boolean =>
      commands.some((_, start) =>
        expectedSequence.every((expected, offset) =>
          isDeepStrictEqual(commands[start + offset], expected),
        ),
      );
    const hardCommandSignature = (command: unknown): string => {
      if (command === null || typeof command !== 'object') return '';
      const record = command as Command;
      const kind = ['extendedWaitUntil', 'assertVisible', 'tapOn'].find(
        (candidate) => candidate in record,
      );
      if (!kind) return '';
      const payload = record[kind] as Command;
      const selector = (payload.visible ?? payload) as Command;
      if (selector.optional === true) return '';
      const ownedText = Array.isArray(selector.containsDescendants)
        ? selector.containsDescendants.find(
            (descendant): descendant is Command =>
              descendant !== null &&
              typeof descendant === 'object' &&
              typeof (descendant as Command).text === 'string',
          )
        : undefined;
      const property = selector.id
        ? `id:${selector.id}`
        : `text:${selector.text}`;
      return `${kind}:${property}${ownedText ? `|text:${ownedText.text}` : ''}`;
    };
    const hasArbitraryAmbiguousTap = (commands: unknown[]): boolean =>
      allObjects(commands).some((command) => {
        const tapOn = command.tapOn;
        if (tapOn === null || typeof tapOn !== 'object') return false;
        const id = (tapOn as Command).id;
        return (
          typeof id === 'string' && id.startsWith('subject-suggestion-option-')
        );
      });
    const correctiveActionIds = new Set([
      'subject-suggestion-accept',
      'subject-use-my-words',
    ]);
    const expectedOwnedCorrectiveTaps = [
      'subject-suggestion-accept|subject-confident-card',
      'subject-suggestion-accept|subject-single-suggestion-card',
      'subject-use-my-words|subject-no-match-card',
    ].sort();
    const ownedCorrectiveTapSignatures = (commands: unknown[]): string[] =>
      allObjects(commands)
        .flatMap((command) => {
          const tapOn = command.tapOn;
          if (typeof tapOn === 'string') {
            return correctiveActionIds.has(tapOn) ? [`${tapOn}|`] : [];
          }
          if (tapOn === null || typeof tapOn !== 'object') return [];
          const tap = tapOn as Command;
          const id = tap.id;
          if (typeof id !== 'string' || !correctiveActionIds.has(id)) return [];
          const childOf = tap.childOf;
          const ownerId =
            childOf !== null && typeof childOf === 'object'
              ? (childOf as Command).id
              : undefined;
          return [`${id}|${typeof ownerId === 'string' ? ownerId : ''}`];
        })
        .sort();
    const satisfiesOutcomeContract = (commands: unknown[]): boolean =>
      hasSequence(commands, outcomeSequence) &&
      !hasArbitraryAmbiguousTap(commands) &&
      isDeepStrictEqual(
        ownedCorrectiveTapSignatures(commands),
        expectedOwnedCorrectiveTaps,
      );

    expect(satisfiesOutcomeContract(subjectCreate)).toBe(true);
    expect(
      hasSequence(subjectCreate.map(hardCommandSignature), [
        'extendedWaitUntil:id:ready-screen',
        'assertVisible:id:ready-start',
        'tapOn:id:ready-start',
        'extendedWaitUntil:id:session-screen',
        'assertVisible:id:chat-shell-back',
        'tapOn:id:chat-shell-back',
        'extendedWaitUntil:id:subjects-screen',
        'extendedWaitUntil:id:subjects-browse-row-.*|text:^Photosynthesis$',
        'assertVisible:id:subjects-browse-row-.*|text:^Photosynthesis$',
      ]),
    ).toBe(true);

    const noMatchCommands = ownedBranch(
      'subject-no-match-card',
      'subject-use-my-words',
    );
    const replaceAt = <T>(
      values: readonly T[],
      index: number,
      value: T,
    ): T[] => {
      const copy = [...values];
      copy[index] = value;
      return copy;
    };
    for (const mutation of [
      // Removal: the branch cannot act without first proving its owner/action.
      outcomeSequence.filter((_, index) => index !== 4),
      // Global proof: sibling assertions do not bind the action to its card.
      replaceAt(
        outcomeSequence,
        4,
        branch('subject-no-match-card', [
          { assertVisible: { id: 'subject-no-match-card' } },
          { assertVisible: { id: 'subject-use-my-words' } },
          noMatchCommands[1]!,
        ]),
      ),
      // Adjacent case: the correct action under the wrong result owner.
      replaceAt(
        outcomeSequence,
        4,
        branch(
          'subject-no-match-card',
          ownedBranch('subject-suggestion-card', 'subject-use-my-words'),
        ),
      ),
      // Wrong action: accepting a suggestion does not exercise no-match.
      replaceAt(
        outcomeSequence,
        4,
        branch(
          'subject-no-match-card',
          ownedBranch('subject-no-match-card', 'subject-suggestion-accept'),
        ),
      ),
      // Optional assertions do not establish evidence.
      replaceAt(
        outcomeSequence,
        4,
        branch(
          'subject-no-match-card',
          replaceAt(noMatchCommands, 0, {
            assertVisible: {
              id: 'subject-no-match-card',
              containsDescendants: [{ id: 'subject-use-my-words' }],
              optional: true,
            },
          }),
        ),
      ),
      // An action before its assertion can mutate away the evidence.
      replaceAt(
        outcomeSequence,
        4,
        branch('subject-no-match-card', [
          noMatchCommands[1]!,
          noMatchCommands[0]!,
        ]),
      ),
      // The ambiguous-card assertion is hard and precedes every outcome.
      replaceAt(outcomeSequence, 1, {
        assertNotVisible: {
          id: 'subject-suggestion-card',
          optional: true,
        },
      }),
      [resolveFinished, ...outcomeSequence.slice(2), failClosed],
      // Even a complete positive sequence is void if it chooses an option.
      [...outcomeSequence, { tapOn: { id: 'subject-suggestion-option-0' } }],
      // A second, global corrective tap is not owned by the proven card.
      [...outcomeSequence, { tapOn: { id: 'subject-suggestion-accept' } }],
      // The right corrective action under a different owner is still unsafe.
      [
        ...outcomeSequence,
        {
          tapOn: {
            id: 'subject-use-my-words',
            childOf: { id: 'subject-confident-card' },
          },
        },
      ],
    ]) {
      expect(satisfiesOutcomeContract(mutation)).toBe(false);
    }
  });

  it('[WI-2241] hard-selects the exact rich supportee through the Support hub before and after relaunch', () => {
    const supporterFlow = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/v2/v2-supporter-scope-journey.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(supporterFlow)[1]?.toJS() as unknown;

    expect(Array.isArray(commands)).toBe(true);
    if (!Array.isArray(commands)) {
      throw new Error('supporter scope Maestro commands must be a YAML list');
    }
    const firstHubReady = commands.findIndex(
      (command) =>
        JSON.stringify(command) ===
        JSON.stringify({
          extendedWaitUntil: {
            visible: { id: 'support-hub-mentor-tab' },
            timeout: 30000,
          },
        }),
    );
    const relaunchStart = commands.findIndex(
      (command) => command === 'stopApp',
    );

    expect(firstHubReady).toBeGreaterThanOrEqual(0);
    expect(commands.slice(firstHubReady, firstHubReady + 5)).toEqual([
      {
        extendedWaitUntil: {
          visible: { id: 'support-hub-mentor-tab' },
          timeout: 30000,
        },
      },
      {
        scrollUntilVisible: {
          element: {
            id: 'support-hub-mentor-open-${SUPPORTEE_PERSON_ID}',
          },
          direction: 'DOWN',
          timeout: 15000,
        },
      },
      {
        assertVisible: {
          id: 'support-hub-mentor-person-${SUPPORTEE_PERSON_ID}',
        },
      },
      {
        assertNotVisible: {
          id: 'scope-chip-option-person-${REVOKED_SUPPORTEE_PERSON_ID}',
        },
      },
      {
        tapOn: {
          id: 'support-hub-mentor-open-${SUPPORTEE_PERSON_ID}',
        },
      },
    ]);
    expect(relaunchStart).toBeGreaterThanOrEqual(0);
    expect(commands.slice(relaunchStart, relaunchStart + 12)).toEqual([
      'stopApp',
      { launchApp: { clearState: false } },
      {
        extendedWaitUntil: {
          visible: { id: 'scope-chip' },
          timeout: 30000,
        },
      },
      {
        tapOn: {
          id: 'scope-chip-option-supporter-hub',
        },
      },
      {
        extendedWaitUntil: {
          visible: { id: 'support-hub-mentor-tab' },
          timeout: 15000,
        },
      },
      {
        scrollUntilVisible: {
          element: {
            id: 'support-hub-mentor-open-${SUPPORTEE_PERSON_ID}',
          },
          direction: 'DOWN',
          timeout: 15000,
        },
      },
      {
        tapOn: {
          id: 'support-hub-mentor-open-${SUPPORTEE_PERSON_ID}',
        },
      },
      {
        extendedWaitUntil: {
          visible: { id: 'person-scope-mentor-tab' },
          timeout: 15000,
        },
      },
      {
        assertVisible: {
          id: 'support-hub-mentor-person-${SUPPORTEE_PERSON_ID}',
        },
      },
      { tapOn: { id: 'tab-journal', retryTapIfNoChange: true } },
      {
        extendedWaitUntil: {
          visible: { id: 'person-scope-journal-placeholder' },
          timeout: 15000,
        },
      },
      {
        assertVisible: {
          id: 'visibility-shared-record',
        },
      },
    ]);
  });

  it('keeps the generated Android APK free of the duplicate OSGI manifest', () => {
    const appConfig = JSON.parse(
      readFileSync(join(repoRoot, 'apps/mobile/app.json'), 'utf8'),
    ) as {
      expo: {
        plugins: Array<
          | string
          | [
              string,
              {
                android?: {
                  packagingOptions?: { exclude?: string[] };
                };
              },
            ]
        >;
      };
    };
    const buildProperties = appConfig.expo.plugins.find(
      (plugin) =>
        Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );

    expect(Array.isArray(buildProperties)).toBe(true);
    expect(
      Array.isArray(buildProperties)
        ? buildProperties[1].android?.packagingOptions?.exclude
        : undefined,
    ).toContain('META-INF/versions/9/OSGI-INF/MANIFEST.MF');
  });
});

type MaestroHarness = {
  root: string;
  binDir: string;
  outputDir: string;
  maestroMarker: string;
  bashEnv: string;
  maestroExit: number;
};

function createMaestroHarness(maestroExit: number): MaestroHarness {
  const root = mkdtempSync(join(tmpdir(), 'wi-1651-maestro-'));
  const binDir = join(root, 'bin');
  const outputDir = join(root, 'artifacts');
  const maestro = join(binDir, 'maestro');
  const adb = join(binDir, 'adb');
  const curl = join(binDir, 'curl');
  const maestroMarker = join(root, 'maestro-ran');
  const bashEnv = join(root, 'bash-env');

  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    maestro,
    [
      '#!/usr/bin/env bash',
      'printf "ran\\n" >> "$FAKE_MAESTRO_MARKER"',
      'if [ "${FAKE_MAESTRO_DRAIN_STDIN:-0}" = "1" ]; then cat >/dev/null; fi',
      'exit "$FAKE_MAESTRO_EXIT"',
      '',
    ].join('\n'),
  );
  writeFileSync(
    adb,
    [
      '#!/usr/bin/env bash',
      'if [ "${FAKE_ADB_DRAIN_STDIN:-0}" = "1" ]; then cat >/dev/null; fi',
      'case "$*" in',
      '  "exec-out screencap -p") printf fake-png ;;',
      '  "exec-out cat /sdcard/ci-maestro-entry.xml") printf \'<node resource-id="welcome-chooser"/>\' ;;',
      '  "logcat -d -t 500") printf fake-logcat ;;',
      'esac',
      '',
    ].join('\n'),
  );
  writeFileSync(
    curl,
    [
      '#!/usr/bin/env bash',
      'if [ "${FAKE_CURL_EXIT:-0}" -ne 0 ]; then exit "$FAKE_CURL_EXIT"; fi',
      'case "$*" in',
      '  */v1/__test/seed*) printf \'{"email":"test@example.com","password":"pw","accountId":"account","profileId":"profile","ids":{}}\' ;;',
      "  *) printf '{}' ;;",
      'esac',
      '',
    ].join('\n'),
  );
  writeFileSync(bashEnv, 'sleep() { :; }\n');
  chmodSync(maestro, 0o755);
  chmodSync(adb, 0o755);
  chmodSync(curl, 0o755);

  return {
    root,
    binDir,
    outputDir,
    maestroMarker,
    bashEnv,
    maestroExit,
  };
}

function runCiMaestro(
  harness: MaestroHarness,
  envOverrides: NodeJS.ProcessEnv = {},
) {
  return spawnSync(
    'bash',
    [join(repoRoot, 'apps/mobile/e2e/scripts/run-ci-maestro.sh')],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${harness.binDir}:${process.env.PATH ?? ''}`,
        BASH_ENV: harness.bashEnv,
        FAKE_MAESTRO_EXIT: String(harness.maestroExit),
        FAKE_MAESTRO_MARKER: harness.maestroMarker,
        MAESTRO_CI_SUITE: 'pr',
        MAESTRO_CI_SHARD: '1',
        MAESTRO_OUTPUT_DIR: harness.outputDir,
        ...envOverrides,
      },
    },
  );
}
