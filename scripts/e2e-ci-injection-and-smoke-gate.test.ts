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
  concurrency?: unknown;
  if?: unknown;
  env?: Record<string, unknown>;
  needs?: unknown;
  strategy?: Record<string, unknown>;
  steps?: Array<Record<string, unknown>>;
  'continue-on-error'?: unknown;
};

type ConcurrencyPolicy = {
  group?: unknown;
  'cancel-in-progress'?: unknown;
};

type NativeInvocation = {
  ref: string;
  shard: number;
};

function resolveConcurrencyGroup(
  policy: ConcurrencyPolicy,
  invocation: NativeInvocation,
): string {
  const context: Record<string, string> = {
    'github.event.workflow_run.head_branch': '',
    'github.ref': invocation.ref,
    'matrix.shard': String(invocation.shard),
  };

  return String(policy.group ?? '').replace(
    /\$\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, expression: string) => {
      const resolved = expression
        .split('||')
        .map((candidate) => context[candidate.trim()] ?? '')
        .find(Boolean);
      if (!resolved) {
        throw new Error(`Unsupported concurrency expression: ${expression}`);
      }
      return resolved;
    },
  );
}

function pairDisposition(
  policyValue: unknown,
  first: NativeInvocation,
  second: NativeInvocation,
): 'overlap' | 'first-cancelled' | 'second-queued' {
  if (policyValue === undefined) return 'overlap';
  const policy = policyValue as ConcurrencyPolicy;
  const firstGroup = resolveConcurrencyGroup(policy, first).toLowerCase();
  const secondGroup = resolveConcurrencyGroup(policy, second).toLowerCase();
  if (firstGroup !== secondGroup) return 'overlap';
  return policy['cancel-in-progress'] === true
    ? 'first-cancelled'
    : 'second-queued';
}

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

  function runWranglerVarsWriter(script: string) {
    const root = mkdtempSync(join(tmpdir(), 'wi-2585-wrangler-vars-'));
    const binDir = join(root, 'bin');
    const doppler = join(binDir, 'doppler');

    mkdirSync(join(root, 'apps', 'api'), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      doppler,
      [
        '#!/usr/bin/env node',
        "const { spawnSync } = require('node:child_process');",
        'const args = process.argv.slice(2);',
        "const commandIndex = args.indexOf('--command');",
        'if (commandIndex < 0) process.exit(64);',
        "const preserved = new Set((args.find((arg) => arg.startsWith('--preserve-env=')) ?? '').split('=')[1]?.split(',') ?? []);",
        'const inheritedDatabaseUrl = process.env.DATABASE_URL;',
        'const env = {',
        '  ...process.env,',
        "  DATABASE_URL: 'postgresql://doppler-staging/mentomate',",
        "  TEST_SEED_SECRET: 'doppler-test-seed-secret',",
        "  CLERK_SECRET_KEY: 'doppler-clerk-secret',",
        "  CLERK_JWKS_URL: 'https://doppler.test/.well-known/jwks.json',",
        "  CLERK_AUDIENCE: 'doppler-audience',",
        "  SEED_PASSWORD: 'doppler-seed-password',",
        '};',
        "if (preserved.has('DATABASE_URL')) env.DATABASE_URL = inheritedDatabaseUrl;",
        "const result = spawnSync('bash', ['-c', args[commandIndex + 1]], { env, stdio: 'inherit' });",
        'process.exit(result.status ?? 1);',
        '',
      ].join('\n'),
    );
    chmodSync(doppler, 0o755);

    try {
      const result = spawnSync(
        'bash',
        ['-e', '-u', '-o', 'pipefail', '-c', script],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH ?? ''}`,
            DATABASE_URL: 'postgresql://runner-local/native-maestro',
            DOPPLER_TOKEN: 'fake-token-present',
          },
        },
      );
      const varsPath = join(root, 'apps', 'api', '.dev.vars');
      const vars = Object.fromEntries(
        readFileSync(varsPath, 'utf8')
          .trim()
          .split('\n')
          .map((line) => line.match(/^([^=]+)=(.*)$/)?.slice(1) ?? []),
      );
      return { result, vars };
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

  it('[WI-2585 native-seed injection] preserves the runner database while importing the required Doppler seed credentials', () => {
    const writeVarsStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Write wrangler .dev.vars for API',
    );
    const { result, vars } = runWranglerVarsWriter(
      String(writeVarsStep?.run ?? ''),
    );

    expect(result.status).toBe(0);
    expect(vars).toEqual({
      DATABASE_URL: 'postgresql://runner-local/native-maestro',
      NODE_ENV: 'test',
      TEST_SEED_SECRET: 'doppler-test-seed-secret',
      CLERK_SECRET_KEY: 'doppler-clerk-secret',
      CLERK_JWKS_URL: 'https://doppler.test/.well-known/jwks.json',
      CLERK_AUDIENCE: 'doppler-audience',
      SEED_PASSWORD: 'doppler-seed-password',
    });
  });

  it('[WI-2585 workflow queue] queues a second same-ref invocation instead of cancelling its active evidence run', () => {
    const workflowPolicy = workflow.concurrency as ConcurrencyPolicy;
    const sameRefSameSlot: [NativeInvocation, NativeInvocation] = [
      { ref: 'refs/heads/main', shard: 1 },
      { ref: 'refs/heads/main', shard: 1 },
    ];

    expect(pairDisposition(workflowPolicy, ...sameRefSameSlot)).toBe(
      'second-queued',
    );
  });

  it('[WI-2585 same-slot concurrency] queues a second native seed user from seed through cleanup without cancellation', () => {
    const nativeSlotPolicy = mobileMaestro.concurrency;
    const differentRefsSameSlot: [NativeInvocation, NativeInvocation] = [
      { ref: 'refs/heads/main', shard: 1 },
      { ref: 'refs/heads/WI-2240', shard: 1 },
    ];

    expect(pairDisposition(nativeSlotPolicy, ...differentRefsSameSlot)).toBe(
      'second-queued',
    );

    const runnerStep = mobileMaestro.steps?.find((step) =>
      String(step.uses ?? '').startsWith(
        'reactivecircus/android-emulator-runner@',
      ),
    );
    const runnerEntry = String(
      (runnerStep?.with as Record<string, unknown> | undefined)?.script ?? '',
    ).trim();
    const runnerSource = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/scripts/run-ci-maestro.sh'),
      'utf8',
    );

    expect(runnerEntry).toBe('bash apps/mobile/e2e/scripts/run-ci-maestro.sh');
    expect(runnerSource).toContain('/v1/__test/seed');
    expect(runnerSource).toContain('/v1/__test/reset');
    expect(runnerSource).toMatch(
      /cleanup\(\) \{[\s\S]*?reset_seed[\s\S]*?\n\}/,
    );
    expect(runnerSource).toContain('trap cleanup EXIT');

    // Mutation sensitivity: removing the slot lease or keying it by ref lets
    // two invocations use the same deterministic seed identity simultaneously.
    expect(pairDisposition(undefined, ...differentRefsSameSlot)).toBe(
      'overlap',
    );
    expect(
      pairDisposition(
        {
          ...(nativeSlotPolicy as ConcurrencyPolicy),
          group: 'native-${{ github.ref }}-${{ matrix.shard }}',
        },
        ...differentRefsSameSlot,
      ),
    ).toBe('overlap');

    // Cancellation violates the evidence contract: the active run must finish.
    expect(
      pairDisposition(
        {
          ...(nativeSlotPolicy as ConcurrencyPolicy),
          'cancel-in-progress': true,
        },
        ...differentRefsSameSlot,
      ),
    ).toBe('first-cancelled');
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
    const flows = plan.map(({ flow }) => flow);

    // WI-2596: more-tab-navigation.yaml and multi-subject.yaml were quarantined
    // (pr-blocking -> blocked, removed from the manifest) because their assertions
    // are red on main — the app is correct, the flows/fixtures drifted. Git-bisected
    // attribution (see each flow header + docs/evidence/wi2596-rgr-maestro-main-health.md):
    // more-tab-navigation = WI-2187 layout/scroll drift (row pushed below the fold,
    // asserted without a scroll); multi-subject = WI-2215 false-green unmasked (its
    // first genuine run failed; underlying cause needs device/DB confirmation). NOT the
    // WI-2241 seed drift an earlier writeup blamed. They must NOT appear in the pr plan;
    // the assertions are left intact.
    expect(plan).toHaveLength(11);
    expect(flows).toContain('flows/app-launch.yaml');
    expect(flows).not.toContain('flows/account/more-tab-navigation.yaml');
    expect(flows).not.toContain('flows/subjects/multi-subject.yaml');
    expect(new Set(flows).size).toBe(plan.length);
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
      // [WI-2226 owner-gate retarget] Supporter cold-start mount — the
      // owner-gated managed card renders on Support hub landing for a
      // same-org managed child (hasOwnAccount=false, on the SUPPORTER's own
      // org — the only candidate resolveSupporterColdStart's owner-gate
      // renders a card for; a cross-org candidate is suppressed).
      {
        flow: 'flows/v2/v2-supporter-coldstart-mount.yaml',
        scenario: 'v2-supporter-managed',
        shard: 1,
      },
      // [WI-2242] Supporter <-> supportee link ceremony — deep-link
      // reachability of the initiate screen, supporter accept, cross-login
      // supportee accept, and a chain into the WI-2241 post-acceptance
      // Support hub / person scope / Journal shape.
      {
        flow: 'flows/v2/v2-supporter-link-ceremony.yaml',
        scenario: 'v2-supporter-pending-link',
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
      // [WI-2243] Supporter self-learning doorway + Me-scope persistence —
      // Support hub -> Me scope (equal, chip-reachable) -> resume own
      // subject -> Subjects -> relaunch preserves Me -> supportee and back,
      // strict scope-isolation walls both directions.
      {
        flow: 'flows/v2/v2-supporter-self-learning-doorway.yaml',
        scenario: 'v2-supporter-self-learning-active',
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

  it('[WI-2584 profile-load-error] hard-fails authenticated bootstrap errors before Back recovery', () => {
    const commands = parseAllDocuments(
      readFileSync(
        join(repoRoot, 'apps/mobile/e2e/flows/_setup/seed-and-sign-in.yaml'),
        'utf8',
      ),
    )[1]?.toJS() as unknown;

    expect(Array.isArray(commands)).toBe(true);
    if (!Array.isArray(commands)) {
      throw new Error('seed-and-sign-in Maestro commands must be a YAML list');
    }

    const signInSubmission = commands.findIndex((command) =>
      isDeepStrictEqual(command, { tapOn: { id: 'sign-in-button' } }),
    );
    const profileLoadErrorGuard = commands.findIndex((command) =>
      isDeepStrictEqual(command, {
        assertNotVisible: { id: 'profile-load-error' },
      }),
    );
    const backRecovery = commands.findIndex((command) =>
      isDeepStrictEqual(command, {
        runFlow: {
          when: { notVisible: { id: 'learner-screen' } },
          file: 'return-to-home-safe.yaml',
        },
      }),
    );
    const settlementProbeIndices = [
      ['learner-screen', 30_000],
      ['dashboard-scroll', 5_000],
      ['parent-home-screen', 5_000],
    ].map(([landingId, timeout]) =>
      commands.findIndex((command) =>
        isDeepStrictEqual(command, {
          extendedWaitUntil: {
            visible: { id: landingId },
            timeout,
            optional: true,
          },
        }),
      ),
    );
    const postApprovalLanding = commands.findIndex((command) =>
      isDeepStrictEqual(command, {
        runFlow: {
          when: { visible: "You're approved!" },
          file: 'dismiss-post-approval.yaml',
        },
      }),
    );
    const postRecoveryProbeIndices = [
      'mentor-screen',
      'support-hub-mentor-tab',
    ].map((landingId) =>
      commands.findIndex((command) =>
        isDeepStrictEqual(command, {
          extendedWaitUntil: {
            visible: { id: landingId },
            timeout: 5_000,
            optional: true,
          },
        }),
      ),
    );

    for (const landingId of [
      'learner-screen',
      'dashboard-scroll',
      'parent-home-screen',
      'mentor-screen',
      'support-hub-mentor-tab',
    ]) {
      expect(commands).toContainEqual({
        extendedWaitUntil: expect.objectContaining({
          visible: { id: landingId },
          optional: true,
        }),
      });
    }
    expect(commands).toContainEqual({
      runFlow: {
        when: { visible: "You're approved!" },
        file: 'dismiss-post-approval.yaml',
      },
    });
    expect(signInSubmission).toBeGreaterThanOrEqual(0);
    for (const settlementProbe of settlementProbeIndices) {
      expect(settlementProbe).toBeGreaterThan(signInSubmission);
      expect(profileLoadErrorGuard).toBeGreaterThan(settlementProbe);
    }
    expect(postApprovalLanding).toBeGreaterThan(signInSubmission);
    expect(profileLoadErrorGuard).toBeGreaterThan(postApprovalLanding);
    expect(profileLoadErrorGuard).toBeGreaterThan(signInSubmission);
    expect(backRecovery).toBe(profileLoadErrorGuard + 1);
    for (const postRecoveryProbe of postRecoveryProbeIndices) {
      expect(postRecoveryProbe).toBeGreaterThan(backRecovery);
    }
  });

  it('[WI-2616] hard-routes V2 link-ceremony cross-logins through Account', () => {
    type Command = Record<string, unknown>;
    const v2SignOutPath = join(
      repoRoot,
      'apps/mobile/e2e/flows/_setup/sign-out-v2.yaml',
    );

    expect(existsSync(v2SignOutPath)).toBe(true);

    const v2SignOut = parseAllDocuments(
      readFileSync(v2SignOutPath, 'utf8'),
    )[1]?.toJS() as unknown;
    const ceremony = parseAllDocuments(
      readFileSync(
        join(
          repoRoot,
          'apps/mobile/e2e/flows/v2/v2-supporter-link-ceremony.yaml',
        ),
        'utf8',
      ),
    )[1]?.toJS() as unknown;

    expect(Array.isArray(v2SignOut)).toBe(true);
    expect(Array.isArray(ceremony)).toBe(true);
    if (!Array.isArray(v2SignOut) || !Array.isArray(ceremony)) {
      throw new Error('WI-2616 Maestro commands must be YAML lists');
    }

    const expectedV2SignOut: Command[] = [
      { openLink: 'mentomate:///mentor' },
      {
        extendedWaitUntil: {
          visible: { id: 'account-avatar-button' },
          timeout: 15000,
        },
      },
      { tapOn: { id: 'account-avatar-button' } },
      {
        extendedWaitUntil: {
          visible: { id: 'account-screen' },
          timeout: 15000,
        },
      },
      {
        scrollUntilVisible: {
          element: { id: 'account-admin-sign-out' },
          direction: 'DOWN',
          timeout: 15000,
        },
      },
      { assertVisible: { id: 'account-admin-sign-out' } },
      { tapOn: { id: 'account-admin-sign-out' } },
      {
        extendedWaitUntil: {
          visible: { id: 'sign-in-button' },
          timeout: 15000,
        },
      },
    ];
    const allObjects = (value: unknown): Command[] => {
      if (Array.isArray(value)) return value.flatMap(allObjects);
      if (value === null || typeof value !== 'object') return [];
      return [value as Command, ...Object.values(value).flatMap(allObjects)];
    };
    const hardCommandSignature = (command: unknown): string => {
      if (command === null || typeof command !== 'object') return '';
      const record = command as Command;
      if (record.optional === true) return '';
      if (typeof record.openLink === 'string') {
        return `openLink:${record.openLink}`;
      }
      const kind = [
        'extendedWaitUntil',
        'scrollUntilVisible',
        'assertVisible',
        'tapOn',
      ].find((candidate) => candidate in record);
      if (!kind) return '';
      const payload = record[kind];
      if (payload === null || typeof payload !== 'object') return '';
      const payloadRecord = payload as Command;
      if (payloadRecord.optional === true) return '';
      const selector = (payloadRecord.visible ??
        payloadRecord.element ??
        payloadRecord) as Command;
      if (selector.optional === true || typeof selector.id !== 'string') {
        return '';
      }
      return `${kind}:id:${selector.id}`;
    };
    const expectedV2SignOutSequence =
      expectedV2SignOut.map(hardCommandSignature);
    const hasSequence = (
      commands: unknown[],
      expectedSequence: unknown[],
    ): boolean =>
      commands.some((_, start) =>
        expectedSequence.every((expected, offset) =>
          isDeepStrictEqual(commands[start + offset], expected),
        ),
      );
    const satisfiesV2SignOutContract = (commands: unknown[]): boolean =>
      hasSequence(
        commands.map(hardCommandSignature),
        expectedV2SignOutSequence,
      ) &&
      !allObjects(commands).some((value) => value.optional === true) &&
      !allObjects(commands).some((value) => typeof value.text === 'string') &&
      !JSON.stringify(commands).includes('"More"') &&
      !JSON.stringify(commands).includes('sign-out-button');
    const replaceAt = <T>(values: T[], index: number, value: T): T[] => {
      const copy = [...values];
      copy[index] = value;
      return copy;
    };
    const withPayloadOptional = (command: Command): Command => {
      const entry = Object.entries(command)[0];
      if (!entry) return { optional: true };
      const [kind, payload] = entry;
      return payload !== null && typeof payload === 'object'
        ? { [kind]: { ...(payload as Command), optional: true } }
        : { ...command, optional: true };
    };
    const expectSequenceMutationsRejected = (
      commands: unknown[],
      start: number,
      length: number,
      satisfies: (candidate: unknown[]) => boolean,
    ): void => {
      for (let offset = 0; offset < length; offset += 1) {
        const index = start + offset;
        expect(
          satisfies(
            commands.filter((_, commandIndex) => commandIndex !== index),
          ),
        ).toBe(false);
        expect(
          satisfies(
            replaceAt(commands, index, {
              assertVisible: { id: `adjacent-sequence-step-${offset}` },
            }),
          ),
        ).toBe(false);
        expect(
          satisfies(
            replaceAt(
              commands,
              index,
              withPayloadOptional(commands[index] as Command),
            ),
          ),
        ).toBe(false);

        if (offset < length - 1) {
          const reordered = [...commands];
          [reordered[index], reordered[index + 1]] = [
            reordered[index + 1],
            reordered[index],
          ];
          expect(satisfies(reordered)).toBe(false);
        }
      }
    };

    expect(satisfiesV2SignOutContract(v2SignOut)).toBe(true);
    expectSequenceMutationsRejected(
      expectedV2SignOut,
      0,
      expectedV2SignOut.length,
      satisfiesV2SignOutContract,
    );
    expect(
      satisfiesV2SignOutContract([
        { tapOn: { text: 'More' } },
        { tapOn: { id: 'sign-out-button' } },
      ]),
    ).toBe(false);
    expect(
      satisfiesV2SignOutContract([
        ...expectedV2SignOut,
        { tapOn: { text: 'Sign out' } },
      ]),
    ).toBe(false);
    expect(
      satisfiesV2SignOutContract([
        ...expectedV2SignOut,
        { tapOn: { id: 'account-avatar-button', optional: true } },
      ]),
    ).toBe(false);

    const v2SignOutCall: Command = {
      runFlow: { file: '../_setup/sign-out-v2.yaml' },
    };
    const legacySignOutCall: Command = {
      runFlow: { file: '../_setup/sign-out.yaml' },
    };
    const supporteeSignInCall: Command = {
      runFlow: {
        file: '../_setup/sign-in-only-returning.yaml',
        env: {
          EMAIL: '${SUPPORTEE_EMAIL}',
          PASSWORD: '${SUPPORTEE_PASSWORD}',
        },
      },
    };
    const supporterSignInCall: Command = {
      runFlow: { file: '../_setup/sign-in-only-returning.yaml' },
    };
    const firstAcceptanceSequence: Command[] = [
      { tapOn: { id: 'visibility-contract-accept' } },
      {
        extendedWaitUntil: {
          notVisible: { id: 'visibility-contract-accept' },
          timeout: 15000,
        },
      },
      { assertNotVisible: { id: 'visibility-link-review' } },
      v2SignOutCall,
      supporteeSignInCall,
    ];
    const secondAcceptanceSequence: Command[] = [
      { tapOn: { id: 'visibility-contract-accept' } },
      {
        extendedWaitUntil: {
          visible: { id: 'visibility-link-review' },
          timeout: 15000,
        },
      },
      { assertVisible: { id: 'visibility-contract-revoke' } },
      v2SignOutCall,
      supporterSignInCall,
    ];
    const callCount = (commands: unknown[], expected: Command): number =>
      commands.filter((command) => isDeepStrictEqual(command, expected)).length;
    const sequenceStart = (
      commands: unknown[],
      expectedSequence: Command[],
    ): number =>
      commands.findIndex((_, start) =>
        expectedSequence.every((expected, offset) =>
          isDeepStrictEqual(commands[start + offset], expected),
        ),
      );
    const satisfiesCeremonyContract = (commands: unknown[]): boolean => {
      const firstAcceptanceStart = sequenceStart(
        commands,
        firstAcceptanceSequence,
      );
      const secondAcceptanceStart = sequenceStart(
        commands,
        secondAcceptanceSequence,
      );
      return (
        callCount(commands, v2SignOutCall) === 2 &&
        callCount(commands, legacySignOutCall) === 0 &&
        callCount(commands, supporteeSignInCall) === 1 &&
        callCount(commands, supporterSignInCall) === 1 &&
        commands.filter((command) => {
          if (command === null || typeof command !== 'object') return false;
          const runFlow = (command as Command).runFlow;
          return (
            runFlow !== null &&
            typeof runFlow === 'object' &&
            (runFlow as Command).file ===
              '../_setup/sign-in-only-returning.yaml'
          );
        }).length === 2 &&
        firstAcceptanceStart >= 0 &&
        secondAcceptanceStart >= 0 &&
        firstAcceptanceStart < secondAcceptanceStart
      );
    };

    expect(satisfiesCeremonyContract(ceremony)).toBe(true);
    const firstAcceptanceStart = sequenceStart(
      ceremony,
      firstAcceptanceSequence,
    );
    const secondAcceptanceStart = sequenceStart(
      ceremony,
      secondAcceptanceSequence,
    );
    expect(firstAcceptanceStart).toBeGreaterThanOrEqual(0);
    expect(secondAcceptanceStart).toBeGreaterThanOrEqual(0);
    expect(firstAcceptanceStart).toBeLessThan(secondAcceptanceStart);
    if (firstAcceptanceStart < 0 || secondAcceptanceStart < 0) {
      throw new Error('WI-2616 acceptance sequences must both be present');
    }
    expect(
      satisfiesCeremonyContract([
        ...ceremony.slice(0, firstAcceptanceStart),
        ...ceremony.slice(
          secondAcceptanceStart,
          secondAcceptanceStart + secondAcceptanceSequence.length,
        ),
        ...ceremony.slice(
          firstAcceptanceStart + firstAcceptanceSequence.length,
          secondAcceptanceStart,
        ),
        ...ceremony.slice(
          firstAcceptanceStart,
          firstAcceptanceStart + firstAcceptanceSequence.length,
        ),
        ...ceremony.slice(
          secondAcceptanceStart + secondAcceptanceSequence.length,
        ),
      ]),
    ).toBe(false);
    expectSequenceMutationsRejected(
      ceremony,
      firstAcceptanceStart,
      firstAcceptanceSequence.length,
      satisfiesCeremonyContract,
    );
    expectSequenceMutationsRejected(
      ceremony,
      secondAcceptanceStart,
      secondAcceptanceSequence.length,
      satisfiesCeremonyContract,
    );

    const signOutIndices = ceremony.flatMap((command, index) =>
      isDeepStrictEqual(command, v2SignOutCall) ? [index] : [],
    );
    expect(signOutIndices).toHaveLength(2);
    for (const signOutIndex of signOutIndices) {
      expect(
        satisfiesCeremonyContract(
          replaceAt(ceremony, signOutIndex, legacySignOutCall),
        ),
      ).toBe(false);
    }
  });

  it('[WI-2506 / WI-2608] binds resolver actions and requires the exact stable Photosynthesis round trip', () => {
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
    const stableOutcome: Command = {
      extendedWaitUntil: {
        visible: {
          id: '^(ready-screen|subject-confident-card|subject-single-suggestion-card|subject-no-match-card|subject-suggestion-card)$',
        },
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
      stableOutcome,
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
      const payloadValue = record[kind];
      if (payloadValue === null || typeof payloadValue !== 'object') return '';
      const payload = payloadValue as Command;
      if (record.optional === true || payload.optional === true) return '';
      const selector = (payload.visible ?? payload) as Command;
      if (selector.optional === true) return '';
      const selectorSignatures = [
        typeof selector.id === 'string' ? `id:${selector.id}` : '',
        typeof selector.text === 'string' ? `text:${selector.text}` : '',
      ].filter(Boolean);
      if (selectorSignatures.length === 0) return '';
      const selectorSignature = selectorSignatures.join(':');
      const descendants = selector.containsDescendants;
      if (descendants === undefined) return `${kind}:${selectorSignature}`;
      if (!Array.isArray(descendants)) return '';
      const descendantSignatures = descendants.map((descendant) => {
        if (descendant === null || typeof descendant !== 'object') return '';
        const descendantSelector = descendant as Command;
        if (descendantSelector.optional === true) return '';
        if (typeof descendantSelector.id === 'string') {
          return `id:${descendantSelector.id}`;
        }
        if (typeof descendantSelector.text === 'string') {
          return `text:${descendantSelector.text}`;
        }
        return '';
      });
      if (descendantSignatures.some((signature) => signature === '')) return '';
      return `${kind}:${selectorSignature}:containsDescendants:${descendantSignatures.join(',')}`;
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
    const isHardResolveLoadingAppearance = (payload: unknown): boolean => {
      if (payload === null || typeof payload !== 'object') return false;
      const record = payload as Command;
      const selector = record.visible ?? record;
      if (selector === null || typeof selector !== 'object') return false;
      const selectorRecord = selector as Command;
      return (
        selectorRecord.id === 'subject-resolve-loading' &&
        record.optional !== true &&
        selectorRecord.optional !== true
      );
    };
    const requiresTransientResolveLoadingAppearance = (
      commands: unknown[],
    ): boolean =>
      allObjects(commands).some(
        (command) =>
          isHardResolveLoadingAppearance(command.extendedWaitUntil) ||
          isHardResolveLoadingAppearance(command.assertVisible),
      );
    const exactSubjectRowId = '^subjects-browse-row-.*$';
    const exactSubjectRowLabel = 'Open Photosynthesis';
    const exactSubjectRowSignature = `id:${exactSubjectRowId}:text:${exactSubjectRowLabel}`;
    const exactSubjectRowWaitSignature = `extendedWaitUntil:${exactSubjectRowSignature}`;
    const exactSubjectRowAssertSignature = `assertVisible:${exactSubjectRowSignature}`;
    const exactCaseSequence = [
      'extendedWaitUntil:id:ready-screen',
      'extendedWaitUntil:text:Starting with Photosynthesis',
      'assertVisible:text:Starting with Photosynthesis',
      'assertVisible:id:ready-start',
      'tapOn:id:ready-start',
      'extendedWaitUntil:id:session-screen',
      'assertVisible:id:chat-shell-back',
      'tapOn:id:chat-shell-back',
      'extendedWaitUntil:id:subjects-screen',
      exactSubjectRowWaitSignature,
      exactSubjectRowAssertSignature,
    ];
    const satisfiesExactCaseContract = (commands: unknown[]): boolean => {
      // This is intentionally an ordered hard-property subsequence: extra
      // diagnostics may surround it without turning a correct case red.
      return (
        !requiresTransientResolveLoadingAppearance(commands) &&
        hasSequence(commands.map(hardCommandSignature), exactCaseSequence)
      );
    };
    const withOptionalCommand = (
      commands: unknown[],
      index: number,
      placement: 'root' | 'payload' | 'selector',
    ): unknown[] => {
      expect(index).toBeGreaterThanOrEqual(0);
      return commands.map((command, commandIndex) => {
        if (commandIndex !== index) return command;
        const record = command as Command;
        if (placement === 'root') {
          return { ...record, optional: true };
        }
        const kind = ['extendedWaitUntil', 'assertVisible'].find(
          (candidate) => candidate in record,
        );
        expect(kind).toBeDefined();
        const payload = record[kind!] as Command;
        if (placement === 'payload') {
          return {
            ...record,
            [kind!]: { ...payload, optional: true },
          };
        }
        const selectorKey = 'visible' in payload ? 'visible' : undefined;
        const selector = (
          selectorKey ? payload[selectorKey] : payload
        ) as Command;
        return {
          ...record,
          [kind!]: selectorKey
            ? { ...payload, [selectorKey]: { ...selector, optional: true } }
            : { ...selector, optional: true },
        };
      });
    };
    const withRowSelectorMutation = (
      commands: unknown[],
      index: number,
      mutation: 'remove-id' | 'change-id' | 'remove-label' | 'change-label',
    ): unknown[] => {
      expect(index).toBeGreaterThanOrEqual(0);
      return commands.map((command, commandIndex) => {
        if (commandIndex !== index) return command;
        const record = command as Command;
        const kind = ['extendedWaitUntil', 'assertVisible'].find(
          (candidate) => candidate in record,
        );
        expect(kind).toBeDefined();
        const payload = record[kind!] as Command;
        const selectorKey = 'visible' in payload ? 'visible' : undefined;
        const selector = (
          selectorKey ? payload[selectorKey] : payload
        ) as Command;
        let mutatedSelector: Command;
        if (mutation === 'remove-id') {
          const { id: _removedId, ...withoutId } = selector;
          mutatedSelector = withoutId;
        } else if (mutation === 'change-id') {
          mutatedSelector = { ...selector, id: '^adjacent-row-.*$' };
        } else if (mutation === 'remove-label') {
          const { text: _removedText, ...withoutText } = selector;
          mutatedSelector = withoutText;
        } else {
          mutatedSelector = { ...selector, text: '^Open Adjacent subject$' };
        }
        return {
          ...record,
          [kind!]: selectorKey
            ? { ...payload, [selectorKey]: mutatedSelector }
            : mutatedSelector,
        };
      });
    };

    expect(satisfiesOutcomeContract(subjectCreate)).toBe(true);
    expect(satisfiesExactCaseContract(subjectCreate)).toBe(true);

    const stableOutcomeSignature =
      'extendedWaitUntil:id:^(ready-screen|subject-confident-card|subject-single-suggestion-card|subject-no-match-card|subject-suggestion-card)$';
    const stableOutcomeIndex = subjectCreate.findIndex(
      (command) => hardCommandSignature(command) === stableOutcomeSignature,
    );
    expect(stableOutcomeIndex).toBeGreaterThanOrEqual(0);
    expect(
      satisfiesOutcomeContract(
        subjectCreate.filter(
          (command) => !isDeepStrictEqual(command, stableOutcome),
        ),
      ),
    ).toBe(false);
    expect(
      satisfiesOutcomeContract(
        withOptionalCommand(subjectCreate, stableOutcomeIndex, 'payload'),
      ),
    ).toBe(false);
    expect(
      satisfiesOutcomeContract(
        withOptionalCommand(subjectCreate, stableOutcomeIndex, 'selector'),
      ),
    ).toBe(false);
    expect(
      satisfiesOutcomeContract(
        withOptionalCommand(subjectCreate, stableOutcomeIndex, 'root'),
      ),
    ).toBe(false);

    const exactReadyWaitIndex = subjectCreate.findIndex(
      (command) =>
        hardCommandSignature(command) ===
        'extendedWaitUntil:text:Starting with Photosynthesis',
    );
    expect(exactReadyWaitIndex).toBeGreaterThanOrEqual(0);
    expect(
      satisfiesExactCaseContract(
        subjectCreate.filter((_, index) => index !== exactReadyWaitIndex),
      ),
    ).toBe(false);
    const exactCaseStart = subjectCreate
      .map(hardCommandSignature)
      .findIndex((_, start, signatures) =>
        exactCaseSequence.every(
          (expected, offset) => signatures[start + offset] === expected,
        ),
      );
    expect(exactCaseStart).toBeGreaterThanOrEqual(0);
    expect(
      satisfiesExactCaseContract([
        ...subjectCreate.slice(0, exactCaseStart),
        subjectCreate[exactCaseStart]!,
        ...subjectCreate.slice(exactCaseStart),
      ]),
    ).toBe(true);
    for (const signature of [
      'extendedWaitUntil:id:ready-screen',
      'extendedWaitUntil:text:Starting with Photosynthesis',
      'assertVisible:text:Starting with Photosynthesis',
      'assertVisible:id:ready-start',
      'extendedWaitUntil:id:session-screen',
      'assertVisible:id:chat-shell-back',
      'extendedWaitUntil:id:subjects-screen',
      exactSubjectRowWaitSignature,
      exactSubjectRowAssertSignature,
    ]) {
      const exactCaseOffset = exactCaseSequence.indexOf(signature);
      expect(exactCaseOffset).toBeGreaterThanOrEqual(0);
      expect(
        satisfiesExactCaseContract(
          withOptionalCommand(
            subjectCreate,
            exactCaseStart + exactCaseOffset,
            'payload',
          ),
        ),
      ).toBe(false);
      expect(
        satisfiesExactCaseContract(
          withOptionalCommand(
            subjectCreate,
            exactCaseStart + exactCaseOffset,
            'selector',
          ),
        ),
      ).toBe(false);
      expect(
        satisfiesExactCaseContract(
          withOptionalCommand(
            subjectCreate,
            exactCaseStart + exactCaseOffset,
            'root',
          ),
        ),
      ).toBe(false);
    }
    for (const signature of [
      exactSubjectRowWaitSignature,
      exactSubjectRowAssertSignature,
    ]) {
      const exactCaseOffset = exactCaseSequence.indexOf(signature);
      expect(exactCaseOffset).toBeGreaterThanOrEqual(0);
      const commandIndex = exactCaseStart + exactCaseOffset;
      for (const mutation of [
        'remove-id',
        'change-id',
        'remove-label',
        'change-label',
      ] as const) {
        expect(
          satisfiesExactCaseContract(
            withRowSelectorMutation(subjectCreate, commandIndex, mutation),
          ),
        ).toBe(false);
      }
    }
    expect(
      satisfiesExactCaseContract([
        ...subjectCreate,
        {
          extendedWaitUntil: {
            visible: { id: 'subject-resolve-loading' },
            timeout: 15000,
          },
        },
      ]),
    ).toBe(false);
    expect(
      satisfiesExactCaseContract([
        ...subjectCreate,
        { assertVisible: { id: 'subject-resolve-loading' } },
      ]),
    ).toBe(false);

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
      outcomeSequence.filter((_, index) => index !== 5),
      // Global proof: sibling assertions do not bind the action to its card.
      replaceAt(
        outcomeSequence,
        5,
        branch('subject-no-match-card', [
          { assertVisible: { id: 'subject-no-match-card' } },
          { assertVisible: { id: 'subject-use-my-words' } },
          noMatchCommands[1]!,
        ]),
      ),
      // Adjacent case: the correct action under the wrong result owner.
      replaceAt(
        outcomeSequence,
        5,
        branch(
          'subject-no-match-card',
          ownedBranch('subject-suggestion-card', 'subject-use-my-words'),
        ),
      ),
      // Wrong action: accepting a suggestion does not exercise no-match.
      replaceAt(
        outcomeSequence,
        5,
        branch(
          'subject-no-match-card',
          ownedBranch('subject-no-match-card', 'subject-suggestion-accept'),
        ),
      ),
      // Optional assertions do not establish evidence.
      replaceAt(
        outcomeSequence,
        5,
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
        5,
        branch('subject-no-match-card', [
          noMatchCommands[1]!,
          noMatchCommands[0]!,
        ]),
      ),
      // The ambiguous-card assertion is hard and precedes every outcome.
      replaceAt(outcomeSequence, 2, {
        assertNotVisible: {
          id: 'subject-suggestion-card',
          optional: true,
        },
      }),
      [stableOutcome, resolveFinished, ...outcomeSequence.slice(3), failClosed],
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
