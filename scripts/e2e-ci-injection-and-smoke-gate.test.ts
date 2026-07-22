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
        "  INNGEST_EVENT_KEY: 'doppler-inngest-event-key',",
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
      expect(result.stdout).toContain(
        `[ci-maestro] Completed shard 1: ${expectedFlows}/${expectedFlows} flows`,
      );
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
    expect(mobileMaestro.env?.EXPO_PUBLIC_ENABLE_MODE_NAV).toBe('true');
    expect(mobileMaestro.env?.EXPO_PUBLIC_ENABLE_MODE_NAV_V1).toBe('true');
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
    expect(writeVarsScript).toContain('INNGEST_EVENT_KEY');
    expect(writeVarsScript).toContain('API_ORIGIN=http://10.0.2.2:8787');
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
      INNGEST_EVENT_KEY: 'doppler-inngest-event-key',
      API_ORIGIN: 'http://10.0.2.2:8787',
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

  it('[WI-1864] keeps the deterministic provider active for ordinary nightly suites', () => {
    const startApiStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Start API server (background)',
    );
    const startApiScript = String(startApiStep?.run ?? '');

    expect(startApiStep?.env?.USE_MAESTRO_V2_FIXTURE).toBeUndefined();
    expect(startApiScript).toContain(
      'pnpm --dir apps/api exec wrangler dev src/test-utils/maestro-e2e-worker.ts',
    );
    expect(startApiScript).not.toMatch(/wrangler dev\s*&/);
  });

  it('[WI-1864] registers a no-network email receipt only in the hosted-Maestro worker', () => {
    const worker = readFileSync(
      join(repoRoot, 'apps/api/src/test-utils/maestro-e2e-worker.ts'),
      'utf8',
    );
    const productionWorker = readFileSync(
      join(repoRoot, 'apps/api/src/index.ts'),
      'utf8',
    );

    expect(worker).toContain("from './maestro-e2e-email-provider'");
    expect(worker).toContain('registerMaestroE2eEmailProvider();');
    expect(productionWorker).not.toContain('maestro-e2e-email-provider');
  });

  it('[WI-1864] relies on the pre-registered fixture without provider keys', () => {
    const writeVarsStep = mobileMaestro.steps?.find(
      (step) => step.name === 'Write wrangler .dev.vars for API',
    );
    const writeVarsScript = String(writeVarsStep?.run ?? '');

    expect(writeVarsScript).not.toContain('ENVIRONMENT=test');
    expect(writeVarsScript).not.toMatch(
      /(?:OPENAI|GEMINI|ANTHROPIC|CEREBRAS|MISTRAL)_API_KEY=/,
    );
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

  it('[WI-1864] keeps every prose-parked flow machine-excluded from scheduled suites', () => {
    const e2eRoot = join(repoRoot, 'apps/mobile/e2e');
    const flowsRoot = join(e2eRoot, 'flows');
    const nightlyFlows = new Set(loadPlan('nightly').map(({ flow }) => flow));
    const walkYaml = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return walkYaml(path);
        return /\.ya?ml$/.test(entry.name) ? [path] : [];
      });
    const parkedFlows = walkYaml(flowsRoot)
      .filter((path) => /^# PARKED\b/m.test(readFileSync(path, 'utf8')))
      .map((path) => relative(e2eRoot, path).replaceAll('\\', '/'));

    expect(parkedFlows.length).toBeGreaterThanOrEqual(10);

    for (const flow of parkedFlows) {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e', flow),
        'utf8',
      );
      const header = parseYaml(source.split(/^---$/m)[0] ?? '') as {
        tags?: string[];
      };

      expect(source).toMatch(/^# PARKED\b/m);
      expect(header.tags).toEqual(
        expect.arrayContaining([expect.stringMatching(/^(blocked|manual)$/)]),
      );
      expect(nightlyFlows).not.toContain(flow);
    }
  });

  it('[WI-1864] returns from Account before asserting language-specific More controls', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/account/app-language-edit.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string } | string;
      pressKey?: string;
      assertVisible?: { text?: string } | string;
    }>;
    const norwegian = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' && tapOn.id === 'language-option-nb',
    );
    const firstBack = commands.findIndex(
      ({ pressKey }, index) => index > norwegian && pressKey === 'back',
    );
    const norwegianSignOut = commands.findIndex(
      ({ assertVisible }, index) =>
        index > firstBack &&
        typeof assertVisible === 'object' &&
        assertVisible.text === 'Logg ut',
    );
    const reenterAccount = commands.findIndex(
      ({ tapOn }, index) =>
        index > norwegianSignOut &&
        typeof tapOn === 'object' &&
        tapOn.id === 'more-row-account',
    );
    const english = commands.findIndex(
      ({ tapOn }, index) =>
        index > reenterAccount &&
        typeof tapOn === 'object' &&
        tapOn.id === 'language-option-en',
    );
    const secondBack = commands.findIndex(
      ({ pressKey }, index) => index > english && pressKey === 'back',
    );
    const englishSignOut = commands.findIndex(
      ({ assertVisible }, index) =>
        index > secondBack &&
        typeof assertVisible === 'object' &&
        assertVisible.text === 'Sign out',
    );

    expect([
      norwegian,
      firstBack,
      norwegianSignOut,
      reenterAccount,
      english,
      secondBack,
      englishSignOut,
    ]).toEqual(
      [
        ...new Set([
          norwegian,
          firstBack,
          norwegianSignOut,
          reenterAccount,
          english,
          secondBack,
          englishSignOut,
        ]),
      ].sort((a, b) => a - b),
    );
    expect(norwegian).toBeGreaterThan(-1);
  });

  it('[WI-1864] runs owner-only export against the explicit adult-owner seed', () => {
    const flow = 'flows/account/export-data.yaml';
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e', flow),
      'utf8',
    );
    const entry = loadPlan('nightly').find(
      (candidate) => candidate.flow === flow,
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: 'UP' | 'DOWN';
        visibilityPercentage?: number;
        centerElement?: boolean;
      };
      tapOn?: { id?: string };
    }>;
    const privacyScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'more-row-privacy' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const privacyTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > privacyScroll && tapOn?.id === 'more-row-privacy',
    );

    expect(source).toContain('SEED_SCENARIO: "subscription-pro-active"');
    expect(entry?.scenario).toBe('subscription-pro-active');
    expect(privacyScroll).toBeGreaterThan(-1);
    expect(privacyTap).toBeGreaterThan(privacyScroll);
  });

  it('[WI-1864] schedules only the supported parent-native populated-memory journey', () => {
    const nightlyFlows = new Set(loadPlan('nightly').map(({ flow }) => flow));
    const duplicate = 'flows/account/learner-mentor-memory-populated.yaml';
    const supported = 'flows/parent/child-mentor-memory-populated.yaml';
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e', duplicate),
      'utf8',
    );
    const header = parseYaml(source.split(/^---$/m)[0] ?? '') as {
      tags?: string[];
    };

    expect(source).toMatch(/^# RETIRED \(WI-1864\)/m);
    expect(header.tags).toContain('manual');
    expect(nightlyFlows).not.toContain(duplicate);
    expect(nightlyFlows).toContain(supported);
  });

  it('[WI-1864] opens populated parent memory with one child-detail navigation', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/parent/child-mentor-memory-populated.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      runFlow?: { file?: string };
      extendedWaitUntil?: { visible?: { id?: string } | string };
      tapOn?: { id?: string };
    }>;
    const parentHome = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'parent-home-screen',
    );
    const settingsTap = commands.findIndex(
      ({ tapOn }) =>
        tapOn?.id === 'parent-home-child-profile-${CHILD_PROFILE_ID}',
    );
    const helperSource = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/_setup/open-family-dashboard.yaml'),
      'utf8',
    );

    expect(
      commands.some(
        ({ runFlow }) =>
          runFlow?.file === '../_setup/open-family-dashboard.yaml',
      ),
    ).toBe(false);
    expect(parentHome).toBeGreaterThan(-1);
    expect(settingsTap).toBeGreaterThan(parentHome);
    expect(
      commands.filter(
        ({ tapOn }) =>
          tapOn?.id === 'parent-home-child-profile-${CHILD_PROFILE_ID}',
      ),
    ).toHaveLength(1);
    expect(source).not.toContain('parent-home-check-child-${CHILD_PROFILE_ID}');
    expect(helperSource).toMatch(/id:\s*['"]child-detail-scroll['"]/);
    expect(helperSource).not.toMatch(/text:\s*['"]Recent sessions['"]/);
  });

  it('[WI-1864] bakes the non-secret OpenAI custom-provider slug into the E2E bundle', () => {
    const step = mobileMaestro.steps?.find(
      (candidate) => candidate.name === 'Load release E2E build environment',
    );

    expect(step).toBeUndefined();
    expect(mobileMaestro.env?.EXPO_PUBLIC_CLERK_OPENAI_SSO_SLUG).toBe('openai');
    expect(loadWorkflowRaw('e2e-ci.yml')).not.toContain(
      'doppler secrets get EXPO_PUBLIC_CLERK_OPENAI_SSO_SLUG',
    );
  });

  it('[WI-1864] drives small-screen dictation and mentor-memory navigation through stable controls', () => {
    const dictationFlows = [
      'flows/dictation/dictation-review-flow.yaml',
      'flows/dictation/dictation-perfect-score.yaml',
    ];
    const photoPickerTileId =
      'com(?:\\.google)?\\.android\\.providers\\.media\\.module:id/icon_thumbnail';

    for (const flow of dictationFlows) {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e', flow),
        'utf8',
      );
      const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
        assertVisible?: { id?: string } | string;
        extendedWaitUntil?: {
          visible?: { id?: string } | string;
        };
        runFlow?: {
          when?: { visible?: { id?: string } | string };
          commands?: Array<{ tapOn?: { id?: string } }>;
        };
        tapOn?: { id?: string; index?: number; optional?: boolean };
      }>;
      expect(source).toMatch(
        /scrollUntilVisible:[\s\S]*id: ["']?practice-dictation["']?/,
      );
      const tileTap = commands.find(
        ({ tapOn }) => tapOn?.id === photoPickerTileId,
      );
      expect(tileTap?.tapOn).toEqual({
        id: photoPickerTileId,
        index: 0,
      });
      const playbackStart = commands.findIndex(
        ({ assertVisible }) =>
          typeof assertVisible === 'object' &&
          assertVisible?.id === 'playback-progress',
      );
      const completeScreen = commands.findIndex(
        ({ extendedWaitUntil }, index) =>
          index > playbackStart &&
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'dictation-complete-screen',
      );
      const playbackCommands = commands.slice(
        playbackStart + 1,
        completeScreen,
      );
      const expectedSkips = flow.endsWith('dictation-perfect-score.yaml')
        ? 2
        : 1;
      const conditionalSkips = playbackCommands.filter(
        ({ runFlow }) =>
          runFlow?.when?.visible !== undefined &&
          runFlow.commands?.some(({ tapOn }) => tapOn?.id === 'playback-skip'),
      );
      expect(conditionalSkips).toHaveLength(expectedSkips);
      expect(
        playbackCommands.filter(({ tapOn }) => tapOn?.id === 'playback-skip'),
      ).toHaveLength(0);
      expect(playbackStart).toBeGreaterThan(-1);
      expect(completeScreen).toBeGreaterThan(playbackStart);
    }

    const remediationFlow = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/dictation/dictation-review-flow.yaml',
      ),
      'utf8',
    );
    const correctionInput = remediationFlow.indexOf(
      "id: 'review-correction-input'",
    );
    const correctionText = remediationFlow.indexOf(
      "inputText: 'The sun is warm.'",
      correctionInput,
    );
    const keyboardDismissal = remediationFlow.indexOf(
      '- hideKeyboard',
      correctionText,
    );
    const submitScroll = remediationFlow.indexOf(
      "id: 'review-submit-correction'",
      keyboardDismissal,
    );
    const submitTap = remediationFlow.indexOf(
      "id: 'review-submit-correction'",
      submitScroll + 1,
    );
    expect([
      correctionInput,
      correctionText,
      keyboardDismissal,
      submitScroll,
      submitTap,
    ]).toEqual(
      [
        ...new Set([
          correctionInput,
          correctionText,
          keyboardDismissal,
          submitScroll,
          submitTap,
        ]),
      ].sort((a, b) => a - b),
    );
    expect(correctionInput).toBeGreaterThan(-1);

    const runner = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/scripts/run-ci-maestro.sh'),
      'utf8',
    );
    expect(runner).toContain('dictation-test-image.png');
    expect(runner).toMatch(/adb push .*dictation-test-image\.png/);
    expect(runner).toContain('android.intent.action.MEDIA_SCANNER_SCAN_FILE');
    const galleryFixture =
      runner.match(/plant_gallery_fixture\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(galleryFixture).not.toContain('--where');
    expect(galleryFixture).toContain(
      'grep -Fq "_display_name=${fixture_name}"',
    );

    const emptyMemory = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/account/learner-mentor-memory.yaml',
      ),
      'utf8',
    );
    expect(emptyMemory).not.toMatch(/pressKey:\s*back/);
    expect(emptyMemory).toMatch(
      /tapOn:[\s\S]*id: ["']?mentor-memory-back["']?/,
    );
  });

  it('[WI-1864] requires the deterministic dictation remediation receipt before celebration', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/dictation/dictation-review-flow.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        timeout?: number;
        optional?: boolean;
      };
      runFlow?: { when?: { visible?: { id?: string } | string } };
      tapOn?: { id?: string };
    }>;
    const remediation = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'review-remediation-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const correctionInput = commands.findIndex(
      ({ tapOn }, index) =>
        index > remediation && tapOn?.id === 'review-correction-input',
    );
    const correctionSubmit = commands.findIndex(
      ({ tapOn }, index) =>
        index > correctionInput && tapOn?.id === 'review-submit-correction',
    );
    const celebration = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > correctionSubmit &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'review-celebration' &&
        extendedWaitUntil.optional !== true,
    );
    const done = commands.findIndex(
      ({ tapOn }, index) => index > celebration && tapOn?.id === 'review-done',
    );

    expect([
      remediation,
      correctionInput,
      correctionSubmit,
      celebration,
      done,
    ]).toEqual(
      [
        remediation,
        correctionInput,
        correctionSubmit,
        celebration,
        done,
      ].toSorted((a, b) => a - b),
    );
    expect(remediation).toBeGreaterThan(-1);
    expect(
      commands.some(
        ({ runFlow }) =>
          typeof runFlow?.when?.visible === 'object' &&
          runFlow.when.visible.id === 'review-celebration',
      ),
    ).toBe(false);
  });

  it('[WI-1864] redacts recorded Maestro input and variable values before artifact upload', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'maestro-redact-'));
    const nested = join(fixtureRoot, 'flow');
    const commandsPath = join(nested, 'commands-(flow.yaml).json');
    const copiedCommandsPath = join(
      nested,
      'commands-(copied-diagnostics.yaml).json',
    );
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      commandsPath,
      JSON.stringify([
        {
          command: {
            inputTextCommand: { text: 'seeded-test-password', optional: false },
          },
          metadata: {
            evaluatedCommand: {
              inputTextCommand: { text: 'seeded-test-password' },
              defineVariablesCommand: {
                env: {
                  EMAIL: 'seeded-user@example.test',
                  PASSWORD: 'seeded-test-password',
                },
              },
            },
          },
          variables: {
            defineVariablesCommand: {
              env: {
                EMAIL: '${EMAIL}',
                PASSWORD: '${PASSWORD}',
              },
            },
          },
          diagnosticLabel: 'seeded-test-password',
        },
      ]),
    );
    writeFileSync(
      copiedCommandsPath,
      JSON.stringify({
        diagnosticCopies: {
          'seeded-test-password': 'email=seeded-user@example.test',
        },
      }),
    );

    try {
      const redactor = join(
        repoRoot,
        'apps/mobile/e2e/scripts/redact-maestro-artifacts.mjs',
      );
      const result = spawnSync(process.execPath, [redactor, fixtureRoot], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      const serialized = readFileSync(commandsPath, 'utf8');
      const [redacted] = JSON.parse(serialized) as Array<{
        command: { inputTextCommand: { text: string } };
        metadata: {
          evaluatedCommand: {
            inputTextCommand: { text: string };
            defineVariablesCommand: {
              env: { EMAIL: string; PASSWORD: string };
            };
          };
        };
        variables: {
          defineVariablesCommand: {
            env: { EMAIL: string; PASSWORD: string };
          };
        };
        diagnosticLabel: string;
      }>;
      expect(redacted.command.inputTextCommand.text).toBe('[REDACTED]');
      expect(redacted.metadata.evaluatedCommand.inputTextCommand.text).toBe(
        '[REDACTED]',
      );
      expect(
        redacted.metadata.evaluatedCommand.defineVariablesCommand.env,
      ).toEqual({
        EMAIL: '[REDACTED]',
        PASSWORD: '[REDACTED]',
      });
      expect(redacted.variables.defineVariablesCommand.env).toEqual({
        EMAIL: '[REDACTED]',
        PASSWORD: '[REDACTED]',
      });
      expect(redacted.diagnosticLabel).toBe('[REDACTED]');
      expect(serialized).not.toContain('seeded-test-password');
      expect(serialized).not.toContain('seeded-user@example.test');
      const copiedSerialized = readFileSync(copiedCommandsPath, 'utf8');
      expect(copiedSerialized).not.toContain('seeded-test-password');
      expect(copiedSerialized).not.toContain('seeded-user@example.test');

      const runner = readFileSync(
        join(repoRoot, 'apps/mobile/e2e/scripts/run-ci-maestro.sh'),
        'utf8',
      );
      const maestroExit = runner.indexOf('local status=$?');
      const redact = runner.indexOf(
        'sanitize_maestro_artifacts "$flow_output"',
        maestroExit,
      );
      const reset = runner.indexOf('reset_seed', redact);
      expect([maestroExit, redact, reset]).toEqual(
        [maestroExit, redact, reset].toSorted((a, b) => a - b),
      );
      expect(maestroExit).toBeGreaterThan(-1);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[WI-1864] removes command recordings and blocks upload when redaction fails', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'maestro-redact-failure-'));
    const validCommands = join(fixtureRoot, 'commands-(a-valid.yaml).json');
    const malformedCommands = join(
      fixtureRoot,
      'commands-(b-malformed.yaml).json',
    );
    writeFileSync(
      validCommands,
      JSON.stringify({
        command: { inputTextCommand: { text: 'seeded-test-password' } },
      }),
    );
    writeFileSync(malformedCommands, 'seeded-test-password');

    try {
      const redactor = join(
        repoRoot,
        'apps/mobile/e2e/scripts/redact-maestro-artifacts.mjs',
      );
      const result = spawnSync(process.execPath, [redactor, fixtureRoot], {
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).not.toContain('seeded-test-password');
      expect(existsSync(validCommands)).toBe(false);
      expect(existsSync(malformedCommands)).toBe(false);

      const sanitize = mobileMaestro.steps?.find(
        (step) => step.id === 'sanitize_maestro_artifacts',
      );
      const upload = mobileMaestro.steps?.find(
        (step) => step.name === 'Upload Maestro artifacts',
      );
      expect(sanitize).toMatchObject({
        if: 'always()',
        id: 'sanitize_maestro_artifacts',
      });
      expect(sanitize?.run).toContain('redact-maestro-artifacts.mjs');
      expect(upload?.if).toBe(
        "always() && steps.sanitize_maestro_artifacts.outcome == 'success'",
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[WI-1864] keeps the zero-subject create flow operable on small viewports', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/edge/empty-first-user.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: 'UP' | 'DOWN';
        visibilityPercentage?: number;
        centerElement?: boolean;
      };
      tapOn?: { id?: string };
      assertVisible?: { id?: string };
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        timeout?: number;
        optional?: boolean;
      };
    }>;
    const scroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'home-add-first-subject',
    );
    const tap = commands.findIndex(
      ({ tapOn }) => tapOn?.id === 'home-add-first-subject',
    );
    expect(scroll).toBeGreaterThan(-1);
    expect(tap).toBeGreaterThan(scroll);
    expect(source).not.toContain('home-add-subject-tile');

    const cancelScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'create-subject-cancel' &&
        scrollUntilVisible.direction === 'UP',
    );
    const cancelAssert = commands.findIndex(
      ({ assertVisible }) => assertVisible?.id === 'create-subject-cancel',
    );
    const firstSubmitScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'create-subject-submit' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const submitAssert = commands.findIndex(
      ({ assertVisible }) => assertVisible?.id === 'create-subject-submit',
    );
    const nameScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'create-subject-name' &&
        scrollUntilVisible.direction === 'UP',
    );
    const nameTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > nameScroll && tapOn?.id === 'create-subject-name',
    );
    const finalSubmitScroll = commands.findLastIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'create-subject-submit' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const submitTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > finalSubmitScroll && tapOn?.id === 'create-subject-submit',
    );
    const readyScreen = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > submitTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'ready-screen',
    );
    const readyStartScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > readyScreen &&
        scrollUntilVisible?.element?.id === 'ready-start' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true,
    );
    const readyStartAssert = commands.findIndex(
      ({ assertVisible }, index) =>
        index > readyStartScroll && assertVisible?.id === 'ready-start',
    );
    const readyStart = commands.findIndex(
      ({ tapOn }, index) =>
        index > readyStartAssert && tapOn?.id === 'ready-start',
    );
    const sessionScreen = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > readyStart &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'session-screen',
    );
    const chatInput = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > sessionScreen &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'chat-input',
    );
    const greeting = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > chatInput &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'message-bubble-assistant-0' &&
        extendedWaitUntil.optional !== true,
    );

    expect(cancelScroll).toBeGreaterThan(tap);
    expect(cancelAssert).toBeGreaterThan(cancelScroll);
    expect(firstSubmitScroll).toBeGreaterThan(cancelAssert);
    expect(submitAssert).toBeGreaterThan(firstSubmitScroll);
    expect(nameScroll).toBeGreaterThan(submitAssert);
    expect(nameTap).toBeGreaterThan(nameScroll);
    expect(finalSubmitScroll).toBeGreaterThan(firstSubmitScroll);
    expect(submitTap).toBeGreaterThan(finalSubmitScroll);
    expect(readyScreen).toBeGreaterThan(submitTap);
    expect(readyStartScroll).toBeGreaterThan(readyScreen);
    expect(readyStartAssert).toBeGreaterThan(readyStartScroll);
    expect(readyStart).toBeGreaterThan(readyStartAssert);
    expect(sessionScreen).toBeGreaterThan(readyStart);
    expect(chatInput).toBeGreaterThan(sessionScreen);
    expect(greeting).toBeGreaterThan(chatInput);
    expect(commands[greeting]?.extendedWaitUntil?.timeout).toBe(30000);
    expect(source).not.toContain('Your mate is here');
  });

  it('[WI-1864] follows the pending gate before native consent handoff', () => {
    for (const flow of [
      'flows/consent/consent-gdpr-under16.yaml',
      'flows/consent/hand-to-parent-consent.yaml',
    ]) {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e', flow),
        'utf8',
      );
      const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
        tapOn?: { id?: string; text?: string } | string;
        extendedWaitUntil?: { visible?: { id?: string } | string };
        assertVisible?: { text?: string } | string;
      }>;
      const submit = commands.findIndex(
        ({ tapOn }) =>
          typeof tapOn === 'object' && tapOn?.id === 'create-profile-submit',
      );
      const pendingGate = commands.findIndex(
        ({ extendedWaitUntil }, index) =>
          index > submit &&
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'consent-pending-gate',
      );
      const sendToParent = commands.findIndex(
        ({ tapOn }, index) =>
          index > pendingGate &&
          typeof tapOn === 'object' &&
          tapOn?.id === 'consent-send-to-parent',
      );
      const childView = commands.findIndex(
        ({ extendedWaitUntil }, index) =>
          index > sendToParent &&
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'consent-child-view',
      );
      const handoffTitle = commands.findIndex(
        ({ assertVisible }, index) =>
          index > childView &&
          typeof assertVisible === 'object' &&
          assertVisible.text === 'Almost there!',
      );

      expect(submit).toBeGreaterThan(-1);
      expect(pendingGate).toBeGreaterThan(submit);
      expect(sendToParent).toBeGreaterThan(pendingGate);
      expect(childView).toBeGreaterThan(sendToParent);
      expect(handoffTitle).toBeGreaterThan(childView);
      expect(
        source.slice(source.indexOf('id: "create-profile-submit"')),
      ).not.toContain('text: "One more step!"');
    }

    const handoffSource = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/consent/hand-to-parent-consent.yaml',
      ),
      'utf8',
    );
    const handoffCommands = parseAllDocuments(handoffSource)
      .at(-1)
      ?.toJSON() as Array<{
      tapOn?: { id?: string; text?: string } | string;
    }>;
    const openYearPicker = handoffCommands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'android:id/date_picker_header_year',
    );
    const tapBirthYear = handoffCommands.findIndex(
      ({ tapOn }, index) =>
        index > openYearPicker &&
        typeof tapOn === 'object' &&
        tapOn.text === '2012',
    );
    const confirmBirthDate = handoffCommands.findIndex(
      ({ tapOn }, index) =>
        index > tapBirthYear &&
        typeof tapOn === 'object' &&
        tapOn.text === 'OK',
    );

    expect(openYearPicker).toBeGreaterThan(-1);
    expect(tapBirthYear).toBeGreaterThan(openYearPicker);
    expect(confirmBirthDate).toBeGreaterThan(tapBirthYear);
    expect(
      handoffCommands.some(
        ({ tapOn }) => typeof tapOn === 'object' && tapOn.text === '2014',
      ),
    ).toBe(false);
  });

  it('[WI-1864] verifies GDPR consent success through stable controls, not stale copy', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/consent/consent-gdpr-under16.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
      assertVisible?: { id?: string; text?: string } | string;
    }>;
    const success = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'consent-success' &&
        extendedWaitUntil.optional !== true,
    );
    const done = commands.findIndex(
      ({ assertVisible }, index) =>
        index > success &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'consent-done',
    );

    expect(success).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(success);
    expect(source).not.toContain('text: "Hand back to your child"');
  });

  it('[WI-1864] allows the full first-curriculum polling window in assessment', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/assessment/assessment-cycle.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string };
      pressKey?: string;
      extendedWaitUntil?: {
        visible?: { id?: string; enabled?: boolean } | string;
        timeout?: number;
        optional?: boolean;
      };
    }>;
    const submit = commands.findIndex(
      ({ tapOn }) => tapOn?.id === 'create-subject-submit',
    );
    const chatReady = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > submit &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'chat-input',
    );

    expect(submit).toBeGreaterThan(-1);
    expect(chatReady).toBeGreaterThan(submit);
    expect(commands[chatReady]?.extendedWaitUntil?.timeout).toBe(30000);

    const submitTurn = commands.findIndex(
      ({ pressKey }, index) => index > chatReady && pressKey === 'Enter',
    );
    const responseReceipt = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > submitTurn &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'message-bubble-assistant-2' &&
        extendedWaitUntil.optional !== true,
    );
    const responseReady = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > responseReceipt &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'chat-input',
    );

    expect(submitTurn).toBeGreaterThan(chatReady);
    expect(responseReceipt).toBeGreaterThan(submitTurn);
    expect(responseReady).toBeGreaterThan(responseReceipt);
    expect(commands[responseReceipt]?.extendedWaitUntil?.timeout).toBe(30000);
    expect(commands[responseReady]?.extendedWaitUntil?.visible).toEqual({
      id: 'chat-input',
      enabled: true,
    });
    expect(commands[responseReady]?.extendedWaitUntil?.timeout).toBe(30000);
  });

  it('[WI-1864] prepares permanent camera denial after clearing app state', () => {
    const runner = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/scripts/run-ci-maestro.sh'),
      'utf8',
    );
    const localRunner = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/scripts/seed-and-run.sh'),
      'utf8',
    );
    const deniedWrapper = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/scripts/seed-and-run-permdenied.sh'),
      'utf8',
    );
    const clear = runner.indexOf('adb shell pm clear "$APP_ID"');
    const deniedBranch = runner.indexOf(
      'if [ "$flow" = "flows/homework/camera-permission-denied.yaml" ]',
    );
    const revoke = runner.indexOf(
      'adb shell pm revoke "$APP_ID" android.permission.CAMERA',
      deniedBranch,
    );
    const permanent = runner.indexOf(
      'adb shell pm set-permission-flags "$APP_ID" android.permission.CAMERA user-set user-fixed',
      deniedBranch,
    );
    const ordinaryGrant = runner.indexOf(
      'adb shell pm grant "$APP_ID" android.permission.CAMERA',
      permanent,
    );

    expect(clear).toBeGreaterThan(-1);
    expect(deniedBranch).toBeGreaterThan(clear);
    expect(revoke).toBeGreaterThan(deniedBranch);
    expect(permanent).toBeGreaterThan(revoke);
    expect(ordinaryGrant).toBeGreaterThan(permanent);
    expect(runner.slice(deniedBranch, ordinaryGrant)).toContain('else');
    const localClear = localRunner.indexOf(
      '$ADB $DEVICE_FLAG shell pm clear "$APP_ID"',
    );
    const localDeniedBranch = localRunner.indexOf(
      'if [ "${E2E_CAMERA_PERMISSION_STATE:-granted}" = "permanently-denied" ]',
    );
    const localRevoke = localRunner.indexOf(
      '$ADB $DEVICE_FLAG shell pm revoke "$APP_ID" android.permission.CAMERA',
      localDeniedBranch,
    );
    const localPermanent = localRunner.indexOf(
      '$ADB $DEVICE_FLAG shell pm set-permission-flags "$APP_ID" android.permission.CAMERA user-set user-fixed',
      localDeniedBranch,
    );
    const localOrdinaryGrant = localRunner.indexOf(
      '$ADB $DEVICE_FLAG shell pm grant "$APP_ID" android.permission.CAMERA',
      localPermanent,
    );

    expect(localClear).toBeGreaterThan(-1);
    expect(localDeniedBranch).toBeGreaterThan(localClear);
    expect(localRevoke).toBeGreaterThan(localDeniedBranch);
    expect(localPermanent).toBeGreaterThan(localRevoke);
    expect(localOrdinaryGrant).toBeGreaterThan(localPermanent);
    expect(localRunner.slice(localDeniedBranch, localOrdinaryGrant)).toContain(
      'else',
    );

    const wrapperState = deniedWrapper.indexOf(
      'export E2E_CAMERA_PERMISSION_STATE=permanently-denied',
    );
    const wrapperDelegate = deniedWrapper.indexOf(
      'exec "$(dirname "$0")/seed-and-run.sh" "$@"',
    );
    expect(wrapperState).toBeGreaterThan(-1);
    expect(wrapperDelegate).toBeGreaterThan(wrapperState);
  });

  it('[WI-1864] follows the intentional no-consent profile destination', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/consent/consent-above-threshold.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string };
      extendedWaitUntil?: { visible?: { id?: string } | string };
      assertVisible?: { id?: string } | string;
      assertNotVisible?: { id?: string; text?: string } | string;
    }>;
    const submit = commands.findIndex(
      ({ tapOn }) => tapOn?.id === 'create-profile-submit',
    );
    const home = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > submit &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'home-screen',
    );
    const learner = commands.findIndex(
      ({ assertVisible }, index) =>
        index > home &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'learner-screen',
    );
    const noConsent = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > learner &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.id === 'consent-child-view',
    );
    const noStep = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > noConsent &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.text === 'One more step!',
    );
    const noWait = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > noStep &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.text === 'Hang tight!',
    );

    expect([submit, home, learner, noConsent, noStep, noWait]).toEqual(
      [submit, home, learner, noConsent, noStep, noWait].toSorted(
        (a, b) => a - b,
      ),
    );
    expect(submit).toBeGreaterThan(-1);
    expect(
      source.slice(source.indexOf('id: "create-profile-submit"')),
    ).not.toContain('create-subject-name');
  });

  it('[WI-1864] asserts adolescent consent copy for the teen pending seed', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/consent/consent-pending-gate.yaml'),
      'utf8',
    );
    const assertions = (
      parseAllDocuments(source).at(-1)?.toJSON() as Array<{
        assertVisible?: { text?: string } | string;
      }>
    ).flatMap(({ assertVisible }) =>
      typeof assertVisible === 'object' && assertVisible.text
        ? [assertVisible.text]
        : [],
    );

    expect(source).toContain('account + TEEN profile');
    expect(assertions).toContain('Hang tight!');
    expect(assertions).toContain('Once they say yes, you can start exploring!');
    expect(assertions).not.toContain('Waiting for approval');
  });

  it('[WI-1864] scrolls the pending-gate sign-out control into the small viewport', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/consent/consent-pending-gate.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
      };
      assertVisible?: { id?: string } | string;
      tapOn?: { id?: string } | string;
    }>;
    const scroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'consent-sign-out' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const assertion = commands.findIndex(
      ({ assertVisible }, index) =>
        index > scroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'consent-sign-out',
    );
    const tap = commands.findIndex(
      ({ tapOn }, index) =>
        index > assertion &&
        typeof tapOn === 'object' &&
        tapOn.id === 'consent-sign-out',
    );

    expect(scroll).toBeGreaterThan(-1);
    expect(assertion).toBeGreaterThan(scroll);
    expect(tap).toBeGreaterThan(assertion);
  });

  it('[WI-1864] confirms consent withdrawal through the current native-alert action', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/consent-management.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { text?: string; optional?: boolean } | string;
      extendedWaitUntil?: { visible?: { id?: string } | string };
    }>;
    const confirmation = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.text === '(?i)confirm.*withdraw consent' &&
        tapOn.optional !== true,
    );
    const withdrawn = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > confirmation &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'consent-withdrawn-empty-state',
    );

    expect(confirmation).toBeGreaterThan(-1);
    expect(withdrawn).toBeGreaterThan(confirmation);
    expect(
      commands.some(
        ({ tapOn }) =>
          typeof tapOn === 'object' &&
          tapOn.optional === true &&
          /withdraw/i.test(tapOn.text ?? ''),
      ),
    ).toBe(false);
  });

  it('[WI-1864] proves fresh redirect replay before asserting the expired redirect fallback', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/auth/deep-link-redirect-ttl-expired.yaml',
      ),
      'utf8',
    );
    const routeSource = readFileSync(
      join(repoRoot, 'apps/mobile/src/app/dev-only/seed-pending-redirect.tsx'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      runFlow?: { file?: string };
      openLink?: string;
      extendedWaitUntil?: { visible?: { id?: string } | string };
      assertNotVisible?: { id?: string } | string;
      tapOn?: { id?: string } | string;
    }>;
    const signIn = commands.findIndex(
      ({ runFlow }) => runFlow?.file === '../_setup/seed-and-sign-in.yaml',
    );
    const freshSeedLink = commands.findIndex(
      ({ openLink }, index) =>
        index > signIn &&
        typeof openLink === 'string' &&
        openLink.includes('/dev-only/seed-pending-redirect?') &&
        openLink.includes('staleMs=0'),
    );
    const freshReceipt = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > freshSeedLink &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'pending-redirect-seeded',
    );
    const freshSignOut = commands.findIndex(
      ({ tapOn }, index) =>
        index > freshReceipt &&
        typeof tapOn === 'object' &&
        tapOn.id === 'pending-redirect-sign-out',
    );
    const freshLibrary = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > freshSignOut &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'library-screen',
    );
    const staleSeedLink = commands.findIndex(
      ({ openLink }, index) =>
        index > freshLibrary &&
        typeof openLink === 'string' &&
        openLink.includes('/dev-only/seed-pending-redirect?') &&
        openLink.includes('staleMs=360000'),
    );
    const staleReceipt = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > staleSeedLink &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'pending-redirect-seeded',
    );
    const staleSignOut = commands.findIndex(
      ({ tapOn }, index) =>
        index > staleReceipt &&
        typeof tapOn === 'object' &&
        tapOn.id === 'pending-redirect-sign-out',
    );
    const fallbackHome = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > staleSignOut &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'home-screen',
    );

    expect(signIn).toBeGreaterThan(-1);
    expect(freshSeedLink).toBeGreaterThan(signIn);
    expect(freshReceipt).toBeGreaterThan(freshSeedLink);
    expect(freshSignOut).toBeGreaterThan(freshReceipt);
    expect(freshLibrary).toBeGreaterThan(freshSignOut);
    expect(staleSeedLink).toBeGreaterThan(freshLibrary);
    expect(staleReceipt).toBeGreaterThan(staleSeedLink);
    expect(staleSignOut).toBeGreaterThan(staleReceipt);
    expect(fallbackHome).toBeGreaterThan(staleSignOut);
    expect(
      commands.findIndex(
        ({ assertNotVisible }, index) =>
          index > fallbackHome &&
          typeof assertNotVisible === 'object' &&
          assertNotVisible.id === 'library-screen',
      ),
    ).toBeGreaterThan(fallbackHome);
    expect(
      commands.filter(
        ({ tapOn }) =>
          typeof tapOn === 'object' && tapOn.id === 'sign-in-email',
      ),
    ).toHaveLength(2);
    const cleanup = routeSource.indexOf('await signOutWithCleanup');
    expect(cleanup).toBeGreaterThan(-1);
    expect(
      routeSource.indexOf('seedPendingAuthRedirectForTesting', cleanup),
    ).toBeGreaterThan(cleanup);
  });

  it('[WI-1864] asserts the current preview-subject contract instead of retired disclaimer copy', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/consent/consent-pending-gate.yaml'),
      'utf8',
    );
    const canonicalCopy = JSON.parse(
      readFileSync(
        join(repoRoot, 'apps/mobile/src/i18n/locales/en.json'),
        'utf8',
      ),
    ) as { tabs: { previewSubjectBrowser: { description: string } } };
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      extendedWaitUntil?: { visible?: { id?: string } | string };
      assertVisible?:
        | {
            id?: string;
            text?: string;
            optional?: boolean;
          }
        | string;
    }>;
    const browser = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'preview-subject-browser',
    );
    const description = commands.findIndex(
      ({ assertVisible }, index) =>
        index > browser &&
        typeof assertVisible === 'object' &&
        assertVisible.text ===
          canonicalCopy.tabs.previewSubjectBrowser.description &&
        assertVisible.optional !== true,
    );

    expect(browser).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(browser);
    expect(source).not.toContain(
      "Here's a preview of what you can learn. You'll unlock these once your parent approves.",
    );
  });

  it('[WI-1864] selects the planted homework image through the API-34 picker tile id', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/homework/gallery-picker.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      extendedWaitUntil?: { visible?: { id?: string } | string };
      tapOn?: {
        id?: string;
        text?: string;
        index?: number;
        optional?: boolean;
      };
    }>;
    const tileId =
      'com(?:\\.google)?\\.android\\.providers\\.media\\.module:id/icon_thumbnail';
    const tileWait = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === tileId,
    );
    const tileTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > tileWait && tapOn?.id === tileId && tapOn.index === 0,
    );

    expect(tileWait).toBeGreaterThan(-1);
    expect(tileTap).toBeGreaterThan(tileWait);
    expect(commands[tileTap]?.tapOn?.optional).not.toBe(true);
    expect(commands.some(({ tapOn }) => tapOn?.text === 'Photos')).toBe(false);
  });

  it('[WI-1864] exercises the seeded wrong-answer dispute and correct-answer suppression paths', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/quiz/quiz-dispute.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      openLink?: string;
      tapOn?: { id?: string; text?: string; optional?: boolean } | string;
      assertNotVisible?: { id?: string; optional?: boolean } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
    }>;
    const launch = commands.findIndex(
      ({ openLink }) =>
        typeof openLink === 'string' &&
        openLink.includes('/quiz/launch?') &&
        openLink.includes('roundId=${ROUND_ID}'),
    );
    const wrongAnswer = commands.findIndex(
      ({ tapOn }, index) =>
        index > launch &&
        typeof tapOn === 'object' &&
        tapOn.text === '${WRONG_ANSWER}' &&
        tapOn.optional !== true,
    );
    const wrongReceipt = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > wrongAnswer &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'quiz-next-question-footer' &&
        extendedWaitUntil.optional !== true,
    );
    const disputeButton = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > wrongReceipt &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'quiz-dispute-button' &&
        extendedWaitUntil.optional !== true,
    );
    const disputeTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > disputeButton &&
        typeof tapOn === 'object' &&
        tapOn.id === 'quiz-dispute-button' &&
        tapOn.optional !== true,
    );
    const disputeNoted = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > disputeTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'quiz-dispute-noted' &&
        extendedWaitUntil.optional !== true,
    );
    const advance = commands.findIndex(
      ({ tapOn }, index) =>
        index > disputeNoted &&
        typeof tapOn === 'object' &&
        tapOn.id === 'quiz-next-question' &&
        tapOn.optional !== true,
    );
    const correctAnswer = commands.findIndex(
      ({ tapOn }, index) =>
        index > advance &&
        typeof tapOn === 'object' &&
        tapOn.text === '${CORRECT_ANSWER}' &&
        tapOn.optional !== true,
    );
    const correctReceipt = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > correctAnswer &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'quiz-next-question-footer' &&
        extendedWaitUntil.optional !== true,
    );
    const disputeSuppressed = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > correctReceipt &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.id === 'quiz-dispute-button' &&
        assertNotVisible.optional !== true,
    );

    expect(launch).toBeGreaterThan(-1);
    expect(wrongAnswer).toBeGreaterThan(launch);
    expect(wrongReceipt).toBeGreaterThan(wrongAnswer);
    expect(disputeButton).toBeGreaterThan(wrongReceipt);
    expect(disputeTap).toBeGreaterThan(disputeButton);
    expect(disputeNoted).toBeGreaterThan(disputeTap);
    expect(advance).toBeGreaterThan(disputeNoted);
    expect(correctAnswer).toBeGreaterThan(advance);
    expect(correctReceipt).toBeGreaterThan(correctAnswer);
    expect(disputeSuppressed).toBeGreaterThan(correctReceipt);
  });

  it('[WI-1864] navigates both axes of the Other practice slider through its container', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/practice/practice-hub-navigation.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
      };
      tapOn?: { id?: string };
    }>;
    const slider = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'practice-other-practice-slider' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 50 &&
        scrollUntilVisible.centerElement === true,
    );
    const recitation = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > slider &&
        scrollUntilVisible?.element?.id === 'practice-recitation' &&
        scrollUntilVisible.direction === 'RIGHT' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true,
    );
    const recitationTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > recitation && tapOn?.id === 'practice-recitation',
    );
    const dictation = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > recitationTap &&
        scrollUntilVisible?.element?.id === 'practice-dictation' &&
        scrollUntilVisible.direction === 'LEFT' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true,
    );
    const secondSlider = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > recitationTap &&
        index < dictation &&
        scrollUntilVisible?.element?.id === 'practice-other-practice-slider' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 50 &&
        scrollUntilVisible.centerElement === true,
    );

    expect(slider).toBeGreaterThan(-1);
    expect(recitation).toBeGreaterThan(slider);
    expect(recitationTap).toBeGreaterThan(recitation);
    expect(secondSlider).toBeGreaterThan(recitationTap);
    expect(dictation).toBeGreaterThan(secondSlider);
  });

  it('[WI-1864] reaches the standalone recitation journey through the slider container', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/practice/recitation-session.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
      };
      tapOn?: { id?: string; text?: string; optional?: boolean };
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
    }>;
    const slider = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'practice-dictation' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true,
    );
    const recitation = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > slider &&
        scrollUntilVisible?.element?.id === 'practice-recitation' &&
        scrollUntilVisible.direction === 'RIGHT' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true,
    );
    const tap = commands.findIndex(
      ({ tapOn }, index) =>
        index > recitation && tapOn?.id === 'practice-recitation',
    );
    const endSession = commands.findIndex(
      ({ tapOn }, index) => index > tap && tapOn?.id === 'end-session-button',
    );
    const confirmEnd = commands.findIndex(
      ({ tapOn }, index) =>
        index > endSession &&
        tapOn?.text === '(?i)^end session$' &&
        tapOn.optional !== true,
    );
    const summaryReady = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > confirmEnd &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'summary-close-button' &&
        extendedWaitUntil.optional !== true,
    );
    const closeSummary = commands.findIndex(
      ({ tapOn }, index) =>
        index > summaryReady &&
        tapOn?.id === 'summary-close-button' &&
        tapOn.optional !== true,
    );
    const practiceReturn = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > closeSummary &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'practice-screen' &&
        extendedWaitUntil.optional !== true,
    );

    expect(slider).toBeGreaterThan(-1);
    expect(recitation).toBeGreaterThan(slider);
    expect(tap).toBeGreaterThan(recitation);
    expect(endSession).toBeGreaterThan(tap);
    expect(confirmEnd).toBeGreaterThan(endSession);
    expect(summaryReady).toBeGreaterThan(confirmEnd);
    expect(closeSummary).toBeGreaterThan(summaryReady);
    expect(practiceReturn).toBeGreaterThan(closeSummary);
    expect(
      commands.some(
        ({ scrollUntilVisible }) =>
          scrollUntilVisible?.element?.id ===
            'practice-other-practice-slider' &&
          scrollUntilVisible.direction === 'DOWN',
      ),
    ).toBe(false);
  });

  it('[WI-1864] opens the seeded parent topic through its stable card id', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/child-drill-down.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string; point?: string; optional?: boolean };
      extendedWaitUntil?: { visible?: { id?: string } | string };
      assertVisible?:
        | {
            id?: string;
            text?: string;
            optional?: boolean;
          }
        | string;
    }>;
    const topicTap = commands.findIndex(
      ({ tapOn }) => tapOn?.id === 'topic-card-${TOPIC_ID}',
    );
    const topicDetail = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > topicTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'topic-detail-screen',
    );
    const statusCard = commands.findIndex(
      ({ assertVisible }, index) =>
        index > topicDetail &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'topic-status-card' &&
        assertVisible.optional !== true,
    );
    const sessionHistory = commands.findIndex(
      ({ assertVisible }, index) =>
        index > statusCard &&
        typeof assertVisible === 'object' &&
        assertVisible.text === 'Session History' &&
        assertVisible.optional !== true,
    );

    expect(commands[topicTap]?.tapOn).toEqual({
      id: 'topic-card-${TOPIC_ID}',
    });
    expect([topicTap, topicDetail, statusCard, sessionHistory]).toEqual(
      [topicTap, topicDetail, statusCard, sessionHistory].toSorted(
        (a, b) => a - b,
      ),
    );
    expect(topicTap).toBeGreaterThan(-1);
    expect(
      commands.some(
        ({ tapOn }) =>
          tapOn?.id === 'subject-topics-scroll' && tapOn.point !== undefined,
      ),
    ).toBe(false);
    expect(
      commands.some(
        ({ assertVisible }) =>
          typeof assertVisible === 'object' &&
          assertVisible.id === 'topic-understanding-card' &&
          assertVisible.optional !== true,
      ),
    ).toBe(false);
  });

  it('[WI-1864] opens child memory through the settings-mode profile control', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/parent/child-memory-consent-prompt.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
      };
    }>;
    const profileTap = commands.findIndex(
      ({ tapOn }) =>
        tapOn?.id === 'parent-home-child-profile-${CHILD_PROFILE_ID}',
    );
    const memoryScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'mentor-memory-link',
    );

    expect(profileTap).toBeGreaterThan(-1);
    expect(memoryScroll).toBeGreaterThan(profileTap);
    expect(source).not.toContain('parent-home-check-child-${CHILD_PROFILE_ID}');
  });

  it('[WI-1864] opens consent management through the settings-mode profile control', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/consent-management.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
      };
    }>;
    const profileTap = commands.findIndex(
      ({ tapOn }) =>
        tapOn?.id === 'parent-home-child-profile-${CHILD_PROFILE_ID}',
    );
    const consentScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'withdraw-consent-button' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true,
    );
    const withdrawTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > consentScroll && tapOn?.id === 'withdraw-consent-button',
    );

    expect(profileTap).toBeGreaterThan(-1);
    expect(consentScroll).toBeGreaterThan(profileTap);
    expect(withdrawTap).toBeGreaterThan(consentScroll);
    expect(source).not.toContain('parent-home-check-child-${CHILD_PROFILE_ID}');
  });

  it('[WI-1864] scrolls to the owner subscription row on the Account screen', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/account/more-tab-navigation.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      extendedWaitUntil?: { visible?: { id?: string } | string };
      scrollUntilVisible?: { element?: { id?: string }; direction?: string };
      assertVisible?: { id?: string } | string;
    }>;
    const accountScreen = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'more-account-scroll',
    );
    const subscriptionScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > accountScreen &&
        scrollUntilVisible?.element?.id === 'more-row-subscription' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const subscriptionAssert = commands.findIndex(
      ({ assertVisible }, index) =>
        index > subscriptionScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'more-row-subscription',
    );

    expect([accountScreen, subscriptionScroll, subscriptionAssert]).toEqual(
      [accountScreen, subscriptionScroll, subscriptionAssert].toSorted(
        (a, b) => a - b,
      ),
    );
    expect(accountScreen).toBeGreaterThan(-1);
  });

  it('[WI-1864] restores the Notifications row before opening it on small screens', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/account/more-tab-navigation.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: { element?: { id?: string }; direction?: string };
      tapOn?: { id?: string };
    }>;
    const signOutLandingScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'sign-out-button' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const notificationScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > signOutLandingScroll &&
        scrollUntilVisible?.element?.id === 'more-row-notifications' &&
        scrollUntilVisible.direction === 'UP',
    );
    const notificationTap = commands.findIndex(
      ({ tapOn }) => tapOn?.id === 'more-row-notifications',
    );
    const accountScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > notificationTap &&
        scrollUntilVisible?.element?.id === 'more-row-account' &&
        scrollUntilVisible.direction === 'UP',
    );
    const accountTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > accountScroll && tapOn?.id === 'more-row-account',
    );
    const privacyScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > accountTap &&
        scrollUntilVisible?.element?.id === 'more-row-privacy' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const privacyTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > privacyScroll && tapOn?.id === 'more-row-privacy',
    );
    const helpScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > privacyTap &&
        scrollUntilVisible?.element?.id === 'more-row-help' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const helpTap = commands.findIndex(
      ({ tapOn }, index) => index > helpScroll && tapOn?.id === 'more-row-help',
    );
    const signOutFinalScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > helpTap &&
        scrollUntilVisible?.element?.id === 'sign-out-button' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const signOutTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > signOutFinalScroll && tapOn?.id === 'sign-out-button',
    );

    expect([
      signOutLandingScroll,
      notificationScroll,
      notificationTap,
      accountScroll,
      accountTap,
      privacyScroll,
      privacyTap,
      helpScroll,
      helpTap,
      signOutFinalScroll,
      signOutTap,
    ]).toEqual(
      [
        signOutLandingScroll,
        notificationScroll,
        notificationTap,
        accountScroll,
        accountTap,
        privacyScroll,
        privacyTap,
        helpScroll,
        helpTap,
        signOutFinalScroll,
        signOutTap,
      ].toSorted((left, right) => left - right),
    );
    expect(signOutLandingScroll).toBeGreaterThan(-1);
  });

  it('[WI-1864] parks preview-self while its product entry flag is hard-disabled', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/onboarding/preview-self.yaml'),
      'utf8',
    );
    const flags = readFileSync(
      join(repoRoot, 'apps/mobile/src/lib/feature-flags.ts'),
      'utf8',
    );
    const header = parseAllDocuments(source)[0]?.toJSON() as {
      tags?: string[];
    };
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      runFlow?: { file?: string };
      extendedWaitUntil?: { visible?: { id?: string } | string };
    }>;
    const welcomeBridge = commands.findIndex(
      ({ runFlow }) =>
        runFlow?.file === '../_setup/nav-welcome-to-sign-in.yaml',
    );
    const signIn = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > welcomeBridge &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'sign-in-screen',
    );

    expect(welcomeBridge).toBe(0);
    expect(signIn).toBeGreaterThan(welcomeBridge);
    expect(flags).toContain('PREVIEW_ENTRY_CTA_ENABLED: false');
    expect(source).toMatch(/^# PARKED\b/m);
    expect(source).toMatch(/^# PM INTAKE: WI-2586\b/m);
    expect(source).toContain(
      'https://www.notion.so/3a48bce91f7c815ca25bdb077de9054c',
    );
    expect(source).toMatch(/^# OWNER: MentoMate Program Manager\b/m);
    expect(source).toMatch(/^# UNBLOCK CONDITION:/m);
    expect(header.tags).toContain('blocked');
    expect(loadPlan('nightly').map(({ flow }) => flow)).not.toContain(
      'flows/onboarding/preview-self.yaml',
    );
  });

  it('[WI-1864] opens weekly reports from parent home without double navigation', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/child-weekly-report.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      runFlow?: { file?: string };
      extendedWaitUntil?: { visible?: { id?: string } | string };
      tapOn?: { id?: string };
    }>;
    const parentHome = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'parent-home-screen',
    );
    const reportTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > parentHome &&
        tapOn?.id === 'parent-home-weekly-report-${CHILD_PROFILE_ID}',
    );

    expect(
      commands.some(
        ({ runFlow }) =>
          runFlow?.file === '../_setup/open-family-dashboard.yaml',
      ),
    ).toBe(false);
    expect(parentHome).toBeGreaterThan(-1);
    expect(reportTap).toBeGreaterThan(parentHome);
  });

  it('[WI-1864] keeps parent child drill-down on its reachable parent-native journey', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/child-drill-down.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      runFlow?: { file?: string };
      assertNotVisible?: { id?: string } | string;
    }>;

    expect(
      commands.some(
        ({ runFlow }) => runFlow?.file === '../_setup/switch-to-child.yaml',
      ),
    ).toBe(false);
    expect(
      commands.some(
        ({ assertNotVisible }) =>
          typeof assertNotVisible === 'object' &&
          assertNotVisible.id === 'view-transcript-cta',
      ),
    ).toBe(false);
  });

  it('[WI-1864] keeps the under-13 native journey at the age floor', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/consent/consent-coppa-under13.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string };
      assertVisible?: { id?: string; text?: string } | string;
      assertNotVisible?: { id?: string; text?: string } | string;
    }>;
    const submit = commands.findIndex(
      ({ tapOn }) => tapOn?.id === 'create-profile-submit',
    );
    const ageFloor = commands.findIndex(
      ({ assertVisible }, index) =>
        index > submit &&
        typeof assertVisible === 'object' &&
        assertVisible.text ===
          'Learners must be at least 13 years old. Please choose an earlier birth date.',
    );
    const noConsent = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > ageFloor &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.id === 'consent-child-view',
    );

    expect([submit, ageFloor, noConsent]).toEqual(
      [submit, ageFloor, noConsent].toSorted((a, b) => a - b),
    );
    expect(submit).toBeGreaterThan(-1);
    expect(
      commands.some(({ tapOn }) => tapOn?.id === 'consent-handoff-button'),
    ).toBe(false);
  });

  it('[WI-1864] waits for every core-learning response before the next turn and closes through the current summary path', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/learning/core-learning.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      pressKey?: string;
      tapOn?: { id?: string; text?: string } | string;
      extendedWaitUntil?: {
        visible?:
          | {
              id?: string;
              enabled?: boolean;
            }
          | string;
        timeout?: number;
      };
      assertVisible?: { id?: string } | string;
    }>;
    const enters = commands.flatMap(({ pressKey }, index) =>
      pressKey === 'Enter' ? [index] : [],
    );
    const expectedReceiptIds = [
      'message-bubble-assistant-3',
      'message-bubble-assistant-5',
      'message-bubble-assistant-7',
    ];

    expect(enters).toHaveLength(3);
    const enabled: number[] = [];
    for (let index = 0; index < enters.length; index += 1) {
      const nextEnter = enters[index + 1] ?? commands.length;
      const receipt = commands.findIndex(
        ({ extendedWaitUntil }, commandIndex) =>
          commandIndex > (enters[index] ?? -1) &&
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === expectedReceiptIds[index],
      );
      const inputEnabled = commands.findIndex(
        ({ extendedWaitUntil }, commandIndex) =>
          commandIndex > receipt &&
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'chat-input' &&
          extendedWaitUntil.visible.enabled === true,
      );

      expect(enters[index]).toBeLessThan(receipt);
      expect(receipt).toBeLessThan(inputEnabled);
      expect(inputEnabled).toBeLessThan(nextEnter);
      expect(commands[inputEnabled]?.extendedWaitUntil?.timeout).toBe(30000);
      enabled.push(inputEnabled);
    }

    const endButton = commands.findIndex(
      ({ tapOn }, index) =>
        index > (enabled.at(-1) ?? -1) &&
        typeof tapOn === 'object' &&
        tapOn.id === 'end-session-button',
    );
    const confirm = commands.findIndex(
      ({ tapOn }, index) =>
        index > endButton &&
        typeof tapOn === 'object' &&
        tapOn.text === 'End Session',
    );
    const summaryTitle = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > confirm &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'summary-title',
    );
    const takeaways = commands.findIndex(
      ({ assertVisible }, index) =>
        index > summaryTitle &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'session-takeaways',
    );
    const close = commands.findIndex(
      ({ tapOn }, index) =>
        index > takeaways &&
        typeof tapOn === 'object' &&
        tapOn.id === 'summary-close-button',
    );
    const home = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > close &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'learner-screen',
    );

    expect([endButton, confirm, summaryTitle, takeaways, close, home]).toEqual(
      [
        ...new Set([endButton, confirm, summaryTitle, takeaways, close, home]),
      ].sort((a, b) => a - b),
    );
    expect(endButton).toBeGreaterThan(enabled.at(-1) ?? -1);
    expect(JSON.stringify(commands)).not.toMatch(
      /summary-(score|topics|close)(?!-button)/,
    );
  });

  it.each([
    {
      flow: 'learning/freeform-session.yaml',
      prompts: [
        'What is photosynthesis?',
        'Can you explain that in simpler terms?',
      ],
      receiptIds: ['message-bubble-assistant-3', 'message-bubble-assistant-5'],
    },
    {
      flow: 'learning/session-summary.yaml',
      prompts: [
        'Explain the concept to me',
        'Can you give me an example of how this works?',
        'That makes sense, thank you',
      ],
      receiptIds: [
        'message-bubble-assistant-3',
        'message-bubble-assistant-5',
        'message-bubble-assistant-7',
      ],
    },
    {
      flow: 'retention/retention-review.yaml',
      prompts: [
        'The key concept involves understanding the relationship between the variables and applying the formula correctly',
        'The second concept relates to how these principles are applied in practice',
      ],
      receiptIds: ['message-bubble-assistant-2', 'message-bubble-assistant-4'],
    },
  ])(
    '[WI-1864] $flow requires a deterministic response receipt before every later turn',
    ({ flow, prompts, receiptIds }) => {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e/flows', flow),
        'utf8',
      );
      const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
        inputText?: string;
        pressKey?: string;
        extendedWaitUntil?: {
          visible?:
            | {
                id?: string;
                enabled?: boolean;
              }
            | string;
          timeout?: number;
        };
      }>;
      let cursor = -1;

      for (const [promptIndex, prompt] of prompts.entries()) {
        const input = commands.findIndex(
          ({ inputText }, index) => index > cursor && inputText === prompt,
        );
        const enter = commands.findIndex(
          ({ pressKey }, index) => index > input && pressKey === 'Enter',
        );
        const receipt = commands.findIndex(
          ({ extendedWaitUntil }, index) =>
            index > enter &&
            typeof extendedWaitUntil?.visible === 'object' &&
            extendedWaitUntil.visible.id === receiptIds[promptIndex],
        );
        const enabled = commands.findIndex(
          ({ extendedWaitUntil }, index) =>
            index > receipt &&
            typeof extendedWaitUntil?.visible === 'object' &&
            extendedWaitUntil.visible.id === 'chat-input' &&
            extendedWaitUntil.visible.enabled === true,
        );

        expect([input, enter, receipt, enabled]).toEqual(
          [input, enter, receipt, enabled].toSorted((a, b) => a - b),
        );
        expect(input).toBeGreaterThan(cursor);
        expect(commands[enabled]?.extendedWaitUntil?.timeout).toBe(30000);
        cursor = enabled;
      }
    },
  );

  it('[WI-1864] retention review waits for its rendered opener instead of stale copy', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/retention/retention-review.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      extendedWaitUntil?: { visible?: { id?: string } | string };
      assertVisible?: { text?: string } | string;
    }>;

    expect(
      commands.some(
        ({ extendedWaitUntil }) =>
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'message-bubble-assistant-0',
      ),
    ).toBe(true);
    expect(JSON.stringify(commands)).not.toContain('what you remember');
  });

  it('[WI-1864] centers the overdue topic row above the sticky book action', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/retention/topic-review-overdue.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
      };
      tapOn?: { id?: string };
    }>;
    const centeredRow = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'done-row-${TOPIC_ID}' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true,
    );
    const topicTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > centeredRow && tapOn?.id === 'done-row-${TOPIC_ID}',
    );

    expect(centeredRow).toBeGreaterThan(-1);
    expect(topicTap).toBeGreaterThan(centeredRow);
  });

  it('[WI-1864] accepts the tall summary input above the Android navigation inset', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/learning/session-summary.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        timeout?: number;
        visibilityPercentage?: number;
      };
      tapOn?: { id?: string } | string;
    }>;
    const inputScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'summary-input' &&
        (scrollUntilVisible.visibilityPercentage ?? 100) <= 90 &&
        (scrollUntilVisible.timeout ?? 0) >= 10000,
    );
    const inputTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > inputScroll &&
        typeof tapOn === 'object' &&
        tapOn.id === 'summary-input',
    );

    expect(inputScroll).toBeGreaterThan(-1);
    expect(inputTap).toBeGreaterThan(inputScroll);
  });

  it('[WI-1864] verifies a freshly submitted summary returns home', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/learning/session-summary.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string } | string;
      extendedWaitUntil?: { visible?: { id?: string } | string };
    }>;
    const continueTap = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' && tapOn.id === 'continue-button',
    );
    const home = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > continueTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'learner-screen',
    );

    expect(continueTap).toBeGreaterThan(-1);
    expect(home).toBeGreaterThan(continueTap);
  });

  it('[WI-1864] scrolls to the owner subscription row before opening billing', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/billing/subscription.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      assertVisible?: { id?: string } | string;
      extendedWaitUntil?: { visible?: { id?: string } | string };
      scrollUntilVisible?: { element?: { id?: string }; direction?: string };
      tapOn?: { id?: string; text?: string } | string;
    }>;
    const rowScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'more-row-subscription' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const rowTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > rowScroll &&
        typeof tapOn === 'object' &&
        tapOn.id === 'more-row-subscription',
    );
    const screen = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > rowTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'subscription-screen',
    );
    const trial = commands.findIndex(
      ({ assertVisible }, index) =>
        index > screen &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'trial-banner',
    );
    const plan = commands.findIndex(
      ({ assertVisible }, index) =>
        index > trial &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'current-plan',
    );

    expect([rowScroll, rowTap, screen, trial, plan]).toEqual(
      [rowScroll, rowTap, screen, trial, plan].toSorted((a, b) => a - b),
    );
    expect(rowScroll).toBeGreaterThan(-1);
    expect(
      commands.some(
        ({ tapOn }) =>
          typeof tapOn === 'object' &&
          (tapOn.text === 'Subscription' || tapOn.text === 'Billing'),
      ),
    ).toBe(false);
  });

  it('[WI-1864] scrolls the tall Pro subscription screen to its no-offerings section', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/billing/static-comparison-pro.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
      };
    }>;
    const noOfferings = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'no-offerings' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const proCard = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > noOfferings &&
        scrollUntilVisible?.element?.id === 'static-tier-pro' &&
        scrollUntilVisible.direction === 'DOWN',
    );

    expect(noOfferings).toBeGreaterThan(-1);
    expect(proCard).toBeGreaterThan(noOfferings);
  });

  it('[WI-1864] scrolls the Family pool to the seeded remove control before tapping it', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/billing/family-pool.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      assertNotVisible?: { id?: string } | string;
      assertVisible?: { id?: string } | string;
      extendedWaitUntil?: { visible?: { id?: string } | string };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
      };
      tapOn?: { id?: string; text?: string; optional?: boolean } | string;
    }>;
    const removeVisible = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id ===
          'remove-family-member-${CHILD_PROFILE_ID1}' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const removeTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > removeVisible &&
        typeof tapOn === 'object' &&
        tapOn.id === 'remove-family-member-${CHILD_PROFILE_ID1}',
    );
    const confirm = commands.findIndex(
      ({ tapOn }, index) =>
        index > removeTap &&
        typeof tapOn === 'object' &&
        tapOn.text === 'Remove',
    );
    const successReady = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > confirm && extendedWaitUntil?.visible === 'Family updated',
    );
    const successDismiss = commands.findIndex(
      ({ tapOn }, index) =>
        index > successReady &&
        typeof tapOn === 'object' &&
        tapOn.text === 'OK' &&
        tapOn.optional !== true,
    );
    const refreshedCount = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > successDismiss &&
        extendedWaitUntil?.visible === '2 of 4 profiles connected',
    );
    const survivorVisible = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > refreshedCount &&
        scrollUntilVisible?.element?.id ===
          'family-member-${CHILD_PROFILE_ID2}' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const removedAbsent = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > survivorVisible &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.id === 'family-member-${CHILD_PROFILE_ID1}',
    );
    const survivorAssert = commands.findIndex(
      ({ assertVisible }, index) =>
        index > removedAbsent &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'family-member-${CHILD_PROFILE_ID2}',
    );

    expect([
      removeVisible,
      removeTap,
      confirm,
      successReady,
      successDismiss,
      refreshedCount,
      survivorVisible,
      removedAbsent,
      survivorAssert,
    ]).toEqual(
      [
        removeVisible,
        removeTap,
        confirm,
        successReady,
        successDismiss,
        refreshedCount,
        survivorVisible,
        removedAbsent,
        survivorAssert,
      ].toSorted((a, b) => a - b),
    );
    expect(removeVisible).toBeGreaterThan(-1);
    expect(commands[successDismiss]?.tapOn).toEqual({ text: 'OK' });
  });

  it('[WI-1864] opens the seeded transcript book through the Shelf BookCard contract', () => {
    const flow = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/learning/session-transcript.yaml'),
      'utf8',
    );
    const bookCard = readFileSync(
      join(repoRoot, 'apps/mobile/src/components/library/BookCard.tsx'),
      'utf8',
    );
    const commands = parseAllDocuments(flow).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string } | string;
      extendedWaitUntil?: { visible?: { id?: string } | string };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        timeout?: number;
        visibilityPercentage?: number;
        centerElement?: boolean;
      };
    }>;
    const shelf = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'shelf-row-header-${SUBJECT_ID}',
    );
    const cardWait = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > shelf &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'book-card-${BOOK_ID}',
    );
    const cardTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > cardWait &&
        typeof tapOn === 'object' &&
        tapOn.id === 'book-card-${BOOK_ID}',
    );
    const book = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > cardTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'book-screen',
    );
    const toggleScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > book &&
        scrollUntilVisible?.element?.id === 'book-sessions-toggle',
    );
    const toggleTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > toggleScroll &&
        typeof tapOn === 'object' &&
        tapOn.id === 'book-sessions-toggle',
    );
    const sessionScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > toggleTap &&
        scrollUntilVisible?.element?.id === 'session-${SESSION_ID}',
    );
    const sessionTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > sessionScroll &&
        typeof tapOn === 'object' &&
        tapOn.id === 'session-${SESSION_ID}',
    );
    const summary = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > sessionTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'summary-title',
    );

    expect([
      shelf,
      cardWait,
      cardTap,
      book,
      toggleScroll,
      toggleTap,
      sessionScroll,
      sessionTap,
      summary,
    ]).toEqual(
      [
        shelf,
        cardWait,
        cardTap,
        book,
        toggleScroll,
        toggleTap,
        sessionScroll,
        sessionTap,
        summary,
      ].toSorted((a, b) => a - b),
    );
    expect(shelf).toBeGreaterThan(-1);
    for (const index of [toggleScroll, sessionScroll]) {
      expect(commands[index]?.scrollUntilVisible).toEqual(
        expect.objectContaining({
          direction: 'DOWN',
          visibilityPercentage: 100,
          centerElement: true,
        }),
      );
    }
    expect(flow).not.toContain('book-row-${BOOK_ID}');
    expect(flow).toContain('components/library/BookCard.tsx');
    expect(bookCard).toContain('testID={`book-card-${book.id}`}');
  });

  it('[WI-1864] opens the seeded retention topic through mandatory stable row ids', () => {
    const flow = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/retention/recall-review.yaml'),
      'utf8',
    );
    const bookCard = readFileSync(
      join(repoRoot, 'apps/mobile/src/components/library/BookCard.tsx'),
      'utf8',
    );
    const bookScreen = readFileSync(
      join(
        repoRoot,
        'apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx',
      ),
      'utf8',
    );
    const progressSource = readFileSync(
      join(repoRoot, 'apps/api/src/services/progress.ts'),
      'utf8',
    );
    const seedSource = readFileSync(
      join(repoRoot, 'apps/api/src/services/test-seed.ts'),
      'utf8',
    );
    const retentionSeed = seedSource.slice(
      seedSource.indexOf('async function seedRetentionDue'),
      seedSource.indexOf('async function seedFailedRecall3x'),
    );
    const commands = parseAllDocuments(flow).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string; optional?: boolean } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        optional?: boolean;
      };
    }>;
    const shelf = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'shelf-row-header-${SUBJECT_ID}',
    );
    const cardWait = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > shelf &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'book-card-${BOOK_ID}',
    );
    const cardTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > cardWait &&
        typeof tapOn === 'object' &&
        tapOn.id === 'book-card-${BOOK_ID}',
    );
    const book = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > cardTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'book-screen',
    );
    const topicScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > book &&
        scrollUntilVisible?.element?.id === 'continue-now-row-${TOPIC_ID}' &&
        scrollUntilVisible.direction === 'DOWN',
    );
    const topicTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > topicScroll &&
        typeof tapOn === 'object' &&
        tapOn.id === 'continue-now-row-${TOPIC_ID}',
    );
    const detail = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > topicTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'topic-detail-scroll',
    );

    expect([
      shelf,
      cardWait,
      cardTap,
      book,
      topicScroll,
      topicTap,
      detail,
    ]).toEqual(
      [shelf, cardWait, cardTap, book, topicScroll, topicTap, detail].toSorted(
        (a, b) => a - b,
      ),
    );
    expect(shelf).toBeGreaterThan(-1);
    for (const index of [
      cardWait,
      cardTap,
      book,
      topicScroll,
      topicTap,
      detail,
    ]) {
      const command = commands[index];
      expect(command?.tapOn).not.toEqual(
        expect.objectContaining({ optional: true }),
      );
      expect(command?.extendedWaitUntil?.optional).not.toBe(true);
      expect(command?.scrollUntilVisible?.optional).not.toBe(true);
    }
    expect(flow).not.toContain('World History');
    expect(flow).not.toContain('text: "Topic"');
    expect(bookCard).toContain('testID={`book-card-${book.id}`}');
    expect(bookScreen).toContain('testID={`${state}-row-${topic.id}`}');
    expect(bookScreen).toContain(
      '(continueNowTopic ? continueNowTopic.id : null) ?? resumeTargetTopicId',
    );
    expect(bookScreen).toContain('if (topic.id === continueId)');
    expect(bookScreen).toContain("state = 'continue-now'");
    expect(progressSource).toContain("resumeKind: 'next_topic'");
    expect(retentionSeed).toContain('topicId: firstTopicId');
  });

  it('[WI-1864] dismisses the library search keyboard before pressing the empty-state clear control', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/learning/library-search.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<
      | string
      | {
          extendedWaitUntil?: { visible?: { id?: string } | string };
          inputText?: string;
          tapOn?: { id?: string } | string;
        }
    >;
    const noMatchInput = commands.findIndex(
      (command) =>
        typeof command === 'object' && command.inputText === 'zzzznoresults',
    );
    const emptyState = commands.findIndex(
      (command) =>
        typeof command === 'object' &&
        typeof command.extendedWaitUntil?.visible === 'object' &&
        command.extendedWaitUntil.visible.id === 'library-search-empty',
    );
    const keyboardDismiss = commands.findIndex(
      (command, index) => index > noMatchInput && command === 'hideKeyboard',
    );
    const emptyStateClear = commands.findIndex(
      (command, index) =>
        index > keyboardDismiss &&
        typeof command === 'object' &&
        typeof command.tapOn === 'object' &&
        command.tapOn.id === 'library-search-clear-results',
    );
    const shelvesRestored = commands.findIndex(
      (command, index) =>
        index > emptyStateClear &&
        typeof command === 'object' &&
        typeof command.extendedWaitUntil?.visible === 'object' &&
        command.extendedWaitUntil.visible.id === 'shelves-list',
    );

    expect([
      noMatchInput,
      keyboardDismiss,
      emptyState,
      emptyStateClear,
      shelvesRestored,
    ]).toEqual(
      [
        noMatchInput,
        keyboardDismiss,
        emptyState,
        emptyStateClear,
        shelvesRestored,
      ].toSorted((a, b) => a - b),
    );
    expect(noMatchInput).toBeGreaterThan(-1);
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
      return `${kind}:${selector.id ? `id:${selector.id}` : `text:${selector.text}`}`;
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
        'extendedWaitUntil:text:Photosynthesis',
        'assertVisible:text:Photosynthesis',
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
      "  *content*query*--projection*_display_name*) printf 'Row: 0 _display_name=dictation-test-image.png' ;;",
      "  *dictation-test-image.png*) printf 'Row: 0 _display_name=dictation-test-image.png' ;;",
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
