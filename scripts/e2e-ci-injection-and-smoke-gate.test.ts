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
//           pass-throughs. Legacy projects are partitioned into an expiry-
//           bearing required-stable lane and an advisory lane in the same setup
//           job. These tests execute the required gate's shell matrix and assert
//           that advisory coverage cannot mask either hard-gated result.
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

type ElementSelector = {
  id?: string;
  text?: string;
  enabled?: boolean;
  containsDescendants?: ElementSelector[];
};

type MaestroCommand = {
  assertVisible?: ElementSelector;
  assertNotVisible?: ElementSelector;
  extendedWaitUntil?: {
    visible?: ElementSelector;
    timeout?: number;
  };
  tapOn?: ElementSelector;
  inputText?: string;
  optional?: boolean;
  runFlow?: {
    when?: { visible?: ElementSelector };
    commands?: MaestroCommand[];
    file?: string;
  };
};

function parseMaestroCommands(source: string): MaestroCommand[] {
  return parseYaml(source.split(/^---$/m)[1] ?? '') as MaestroCommand[];
}

function maestroSelectorIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(maestroSelectorIds);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) =>
    key === 'id' && typeof nested === 'string'
      ? [nested]
      : maestroSelectorIds(nested),
  );
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

describe('[WI-2228/WI-2458] e2e-web.yml gates V2 and stable legacy smoke', () => {
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

  it('runs V2 first and partitions legacy smoke into required and advisory lanes', () => {
    const runSmoke = jobs['run-smoke'];
    expect(runSmoke).toBeDefined();
    const v2Step = stepNamed(runSmoke, 'Run V2 release Playwright gate');
    const resolveStep = stepNamed(
      runSmoke,
      'Validate and resolve legacy Playwright lanes',
    );
    const coreStep = stepNamed(
      runSmoke,
      'Run required-stable legacy Playwright smoke',
    );
    const advisoryStep = stepNamed(
      runSmoke,
      'Run advisory legacy Playwright smoke',
    );
    const resetStep = stepNamed(
      runSmoke,
      'Reset seeded staging accounts (always)',
    );
    const stepNames = (runSmoke.steps ?? []).map((step) => step.name);
    const allWorkflowSteps = Object.values(jobs).flatMap(
      (job) => job.steps ?? [],
    );
    const v2Script = String(v2Step?.run ?? '');
    const resolveScript = String(resolveStep?.run ?? '');
    const coreScript = String(coreStep?.run ?? '');
    const advisoryScript = String(advisoryStep?.run ?? '');
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

    expect(resolveStep?.['continue-on-error']).not.toBe(true);
    expect(resolveScript).toContain('run-smoke-lanes.cjs validate');
    expect(resolveScript).toContain('run-smoke-lanes.cjs core');
    expect(resolveScript).toContain('run-smoke-lanes.cjs advisory');
    expect(coreStep?.['continue-on-error']).not.toBe(true);
    expect(advisoryStep?.['continue-on-error']).toBe(true);
    expect(Number(coreStep?.['timeout-minutes'])).toBeGreaterThan(0);
    expect(Number(advisoryStep?.['timeout-minutes'])).toBeGreaterThan(0);
    expect(
      Number(runSmoke['timeout-minutes']) -
        Number(coreStep?.['timeout-minutes']) -
        Number(advisoryStep?.['timeout-minutes']),
    ).toBeGreaterThanOrEqual(20);
    expect(String(coreStep?.if).replace(/\s+/g, '')).toContain(
      "steps.legacy-lanes.outputs.core!=''",
    );
    expect(String(advisoryStep?.if).replace(/\s+/g, '')).toContain(
      'always()&&!cancelled()',
    );
    expect(String(advisoryStep?.if).replace(/\s+/g, '')).toContain(
      "steps.legacy-lanes.outputs.advisory!=''",
    );
    expect(coreStep?.env?.DOPPLER_TOKEN).toBe(v2Step?.env?.DOPPLER_TOKEN);
    expect(advisoryStep?.env?.DOPPLER_TOKEN).toBe(v2Step?.env?.DOPPLER_TOKEN);
    for (const mapping of [
      'PLAYWRIGHT_TEST_SEED_SECRET',
      'CLERK_SECRET_KEY',
      'PLAYWRIGHT_API_URL',
    ]) {
      expect(v2Script).toContain(mapping);
      expect(coreScript).toContain(mapping);
      expect(advisoryScript).toContain(mapping);
    }
    expect(coreScript).toContain('PLAYWRIGHT_ARTIFACT_LANE=legacy-core');
    expect(coreScript).toContain('pnpm run test:e2e:web:smoke -- core');
    expect(advisoryScript).toContain(
      'PLAYWRIGHT_ARTIFACT_LANE=legacy-advisory',
    );
    expect(advisoryScript).toContain('pnpm run test:e2e:web:smoke -- advisory');

    // WI-2594: the "Upload V2/legacy Playwright artifacts" steps were
    // removed (both trees record fill-step values, e.g. seeded login
    // credentials, in clear text — see WI-2593). The non-vacuity guard
    // against reintroducing them lives in
    // scripts/e2e-web-artifact-upload-guard.test.ts.
    expect(stepNames.indexOf(v2Step?.name)).toBeLessThan(
      stepNames.indexOf(resolveStep?.name),
    );
    expect(stepNames.indexOf(resolveStep?.name)).toBeLessThan(
      stepNames.indexOf(coreStep?.name),
    );
    expect(stepNames.indexOf(coreStep?.name)).toBeLessThan(
      stepNames.indexOf(advisoryStep?.name),
    );
    expect(stepNames.indexOf(advisoryStep?.name)).toBeLessThan(
      stepNames.indexOf(resetStep?.name),
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

  it('runs the quarantine resolver tests in CI', () => {
    const ci = loadWorkflow('ci.yml');
    const ciJobs = ci.jobs as Record<string, Job>;
    const main = ciJobs['main'];
    const quarantineTests = stepNamed(main, 'tools/quarantine/* tests');

    expect(quarantineTests).toBeDefined();
    expect(String(quarantineTests?.run)).toContain(
      'jest --config tools/quarantine/jest.config.cjs',
    );
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

  it('routes only the validated legacy lane to a distinct Playwright test-results path', () => {
    // WI-2594: the 'html' reporter (and its per-lane reportDir) was removed
    // from apps/mobile/playwright.config.ts — it embedded fill-step values,
    // e.g. seeded login credentials, in clear text (WI-2593). This test now
    // only inspects outputDir (the local-only test-results directory the
    // staging-gate classifier still reads on the runner).
    const inspectSource = [
      "import config from './apps/mobile/playwright.config.ts';",
      'process.stdout.write(JSON.stringify({ outputDir: config.outputDir }));',
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
    ) as { outputDir: string };
    expect(defaultArtifacts.outputDir.replaceAll('\\', '/')).toMatch(
      /e2e-web\/test-results$/,
    );

    for (const lane of ['legacy-core', 'legacy-advisory']) {
      const legacyResult = inspect(lane);
      expect(legacyResult.status).toBe(0);
      const legacyArtifacts = JSON.parse(
        legacyResult.stdout.trim().split('\n').at(-1)!,
      ) as { outputDir: string };
      expect(legacyArtifacts.outputDir.replaceAll('\\', '/')).toMatch(
        new RegExp('e2e-web/test-results-' + lane + '$'),
      );
    }

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
    expect(packageJson.scripts['test:e2e:web:smoke']).toBe(
      'node tools/quarantine/run-smoke-projects.cjs',
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

  it('[WI-2604] uses rendered shelf readiness instead of global network idle', () => {
    const learnerCrawl = readFileSync(
      join(repoRoot, 'apps/mobile/e2e-web/flows/journeys/j01-ux-pass.spec.ts'),
      'utf8',
    );

    expect(learnerCrawl).toContain(
      "await gotoScreen(page, '/library', `shelf-row-header-${subjectId}`);",
    );
    expect(learnerCrawl).not.toContain("waitForLoadState('networkidle')");
  });

  it('[WI-2604] disables retries only for smoke-learner in CI', () => {
    const inspectSource = [
      "import config from './apps/mobile/playwright.config.ts';",
      "const learner = config.projects.find(({ name }) => name === 'smoke-learner');",
      "const parent = config.projects.find(({ name }) => name === 'smoke-parent');",
      'process.stdout.write(JSON.stringify({',
      'globalRetries: config.retries,',
      'learnerRetries: learner?.retries,',
      'parentExists: parent !== undefined,',
      "parentHasRetryOverride: Object.hasOwn(parent ?? {}, 'retries'),",
      '}));',
    ].join(' ');
    const inspect = spawnSync('pnpm', ['exec', 'tsx', '-e', inspectSource], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
    });

    expect(inspect.status).toBe(0);
    expect(JSON.parse(inspect.stdout.trim().split('\n').at(-1)!)).toEqual({
      globalRetries: 1,
      learnerRetries: 0,
      parentExists: true,
      parentHasRetryOverride: false,
    });
  });
});

describe('[WI-2240] V2 Account manifest and Maestro YAML contract validation', () => {
  const nativeFlowRoot = join(repoRoot, 'apps/mobile/e2e/flows/v2');
  const ownerNative = readFileSync(
    join(nativeFlowRoot, 'v2-account-owner.yaml'),
    'utf8',
  );
  const nonOwnerNative = readFileSync(
    join(nativeFlowRoot, 'v2-account-non-owner-child.yaml'),
    'utf8',
  );
  const manifest = JSON.parse(
    readFileSync(
      join(repoRoot, 'apps/mobile/e2e/ci-maestro-manifest.json'),
      'utf8',
    ),
  ) as {
    v2: Array<{ flow: string; scenario: string | null }>;
  };

  type MaestroCommand = Record<string, unknown> | string;
  type MaestroExpectation = {
    command: string;
    id?: string;
    text?: string;
    descendantText?: string;
    selected?: boolean;
    value?: string;
  };

  function parseMaestroCommands(source: string): MaestroCommand[] {
    const document = source.split(/^---$/m)[1];
    expect(document).toBeDefined();
    return parseYaml(document!) as MaestroCommand[];
  }

  function selectorValues(key: 'id' | 'text', value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.flatMap((item) => selectorValues(key, item));
    }
    if (typeof value !== 'object' || value === null) return [];

    return Object.entries(value).flatMap(([nestedKey, nested]) =>
      nestedKey === key && typeof nested === 'string'
        ? [nested]
        : selectorValues(key, nested),
    );
  }

  function hasOptionalTrue(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(hasOptionalTrue);
    if (typeof value !== 'object' || value === null) return false;
    return Object.entries(value).some(
      ([key, nested]) =>
        (key === 'optional' && nested === true) || hasOptionalTrue(nested),
    );
  }

  function maestroSelectorRoot(
    command: string,
    value: unknown,
  ): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null) return null;
    const commandRoot = value as Record<string, unknown>;
    if (command === 'extendedWaitUntil') {
      const visibleRoot = commandRoot.visible;
      return typeof visibleRoot === 'object' && visibleRoot !== null
        ? (visibleRoot as Record<string, unknown>)
        : null;
    }
    if (command === 'scrollUntilVisible') {
      const elementRoot = commandRoot.element;
      return typeof elementRoot === 'object' && elementRoot !== null
        ? (elementRoot as Record<string, unknown>)
        : null;
    }
    return commandRoot;
  }

  function matchesMaestroCommand(
    actual: MaestroCommand,
    expected: MaestroExpectation,
  ): boolean {
    if (typeof actual === 'string') {
      return actual === expected.command && expected.value === undefined;
    }
    if (!(expected.command in actual)) return false;
    const value = actual[expected.command];
    if (expected.value !== undefined) return value === expected.value;
    const root = maestroSelectorRoot(expected.command, value);
    if (!root) return false;
    if (expected.id !== undefined && root.id !== expected.id) return false;
    if (expected.text !== undefined && root.text !== expected.text)
      return false;
    if (
      expected.selected !== undefined &&
      root.selected !== expected.selected
    ) {
      return false;
    }
    if (expected.descendantText !== undefined) {
      const descendants = root.containsDescendants;
      if (
        !Array.isArray(descendants) ||
        !descendants.some(
          (descendant) =>
            typeof descendant === 'object' &&
            descendant !== null &&
            (descendant as Record<string, unknown>).text ===
              expected.descendantText,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  function hasMaestroOrder(
    commands: MaestroCommand[],
    expected: MaestroExpectation[],
  ): boolean {
    let cursor = 0;
    for (const step of expected) {
      const index = commands.findIndex(
        (command, commandIndex) =>
          commandIndex >= cursor && matchesMaestroCommand(command, step),
      );
      if (index < 0) return false;
      cursor = index + 1;
    }
    return true;
  }

  const visible = (
    id?: string,
    text?: string,
    selected?: boolean,
  ): MaestroExpectation => ({
    command: 'assertVisible',
    id,
    text,
    selected,
  });
  const absent = (id?: string, text?: string): MaestroExpectation => ({
    command: 'assertNotVisible',
    id,
    text,
  });
  const waitVisible = (id: string): MaestroExpectation => ({
    command: 'extendedWaitUntil',
    id,
  });
  const scrollVisible = (id: string): MaestroExpectation => ({
    command: 'scrollUntilVisible',
    id,
  });
  const visibleWithDescendant = (
    id: string,
    descendantText: string,
  ): MaestroExpectation => ({
    command: 'assertVisible',
    id,
    descendantText,
  });
  const tap = (id: string): MaestroExpectation => ({
    command: 'tapOn',
    id,
  });

  const permittedRows = [
    'account-admin-learning-preferences',
    'account-admin-mentor-memory',
    'account-admin-mentor-language',
    'account-admin-profile',
    'account-admin-notifications',
    'account-admin-privacy',
    'account-admin-help',
    'account-admin-sign-out',
  ];
  const ownerOnlyRows = [
    'account-admin-security',
    'account-admin-subscription',
    'account-admin-add-child',
    'account-admin-family-settings',
  ];
  const noOwnerDataBoundary = [
    waitVisible('sign-in-button'),
    absent('account-screen'),
    absent('account-avatar-button'),
    absent('mentor-screen'),
    absent('subjects-screen'),
    absent('journal-screen'),
    absent(undefined, '^Test Parent$'),
    absent(undefined, '^General Knowledge$'),
  ];
  const ownerSignOutContract = [
    waitVisible('subjects-screen'),
    visible('tab-subjects', undefined, true),
    visible('account-avatar-button', '^Open account settings for Test Parent$'),
    visibleWithDescendant(
      'subjects-browse-row-${OWNER_SUBJECT_ID}',
      '^General Knowledge$',
    ),
    tap('account-avatar-button'),
    waitVisible('account-screen'),
    visible(undefined, '^Test Parent$'),
    tap('account-admin-sign-out'),
    ...noOwnerDataBoundary,
    { command: 'pressKey', value: 'back' },
    { command: 'openLink', value: 'mentomate:///subjects' },
    ...noOwnerDataBoundary,
    { command: 'stopApp' },
    { command: 'openLink', value: 'mentomate:///subjects' },
    ...noOwnerDataBoundary,
  ];

  function hasExactOwnerSignOutContract(commands: MaestroCommand[]): boolean {
    const signOutIndex = commands.findIndex((command) =>
      matchesMaestroCommand(command, tap('account-admin-sign-out')),
    );
    if (signOutIndex < 0) return false;
    const signOutTexts = selectorValues('text', commands.slice(signOutIndex));

    return (
      !commands.some(hasOptionalTrue) &&
      !signOutTexts.includes('^Emma$') &&
      !signOutTexts.includes('^Mathematics$') &&
      hasMaestroOrder(commands, ownerSignOutContract)
    );
  }

  function cloneCommands(commands: MaestroCommand[]): MaestroCommand[] {
    return JSON.parse(JSON.stringify(commands)) as MaestroCommand[];
  }

  function replaceSelectorText(value: unknown, from: string, to: string): void {
    if (Array.isArray(value)) {
      for (const item of value) replaceSelectorText(item, from, to);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'text' && nested === from) {
        (value as Record<string, unknown>)[key] = to;
      } else {
        replaceSelectorText(nested, from, to);
      }
    }
  }

  it('registers the exact owner and non-owner flows in the V2 manifest', () => {
    expect(manifest.v2).toEqual(
      expect.arrayContaining([
        {
          flow: 'flows/v2/v2-account-owner.yaml',
          scenario: 'parent-multi-child',
        },
        {
          flow: 'flows/v2/v2-account-non-owner-child.yaml',
          scenario: 'v2-account-non-owner-child',
        },
      ]),
    );
  });

  it('requires the native owner learner identity and Account round-trip sequence without a supporter-only scope chip', () => {
    const commands = parseMaestroCommands(ownerNative);
    const selectorIds = selectorValues('id', commands);
    expect(selectorIds.filter((id) => id.startsWith('scope-chip'))).toEqual([]);
    expect(selectorIds.filter((id) => id.startsWith('person-scope-'))).toEqual(
      [],
    );

    expect(
      hasMaestroOrder(commands, [
        waitVisible('mentor-screen'),
        visible('tab-mentor', undefined, true),
        visible(
          'account-avatar-button',
          '^Open account settings for Test Parent$',
        ),
        tap('account-avatar-button'),
        waitVisible('account-screen'),
        visible('account-admin-profile'),
        scrollVisible('account-admin-notifications'),
        visible('account-admin-notifications'),
        ...ownerOnlyRows.map((row) => visible(row)),
        tap('account-back'),
        waitVisible('mentor-screen'),
        tap('tab-subjects'),
        waitVisible('subjects-screen'),
        visible('tab-subjects', undefined, true),
        visibleWithDescendant(
          'subjects-browse-row-${OWNER_SUBJECT_ID}',
          '^General Knowledge$',
        ),
        tap('account-avatar-button'),
        { command: 'pressKey', value: 'back' },
        waitVisible('subjects-screen'),
        tap('tab-journal'),
        waitVisible('journal-screen'),
        visible('tab-journal', undefined, true),
        tap('account-avatar-button'),
        visible('account-admin-privacy'),
        tap('account-admin-privacy'),
        { command: 'pressKey', value: 'back' },
        tap('account-back'),
        waitVisible('journal-screen'),
      ]),
    ).toBe(true);
  });

  it('requires the separate native Test Child subject and permitted-row sequence', () => {
    const commands = parseMaestroCommands(nonOwnerNative);
    expect(
      hasMaestroOrder(commands, [
        visible('tab-subjects', undefined, true),
        visible(
          'account-avatar-button',
          '^Open account settings for Test Child$',
        ),
        visibleWithDescendant(
          'subjects-browse-row-${SUBJECT_ID}',
          '^Child Learning Data$',
        ),
        tap('account-avatar-button'),
        waitVisible('account-screen'),
        visible(undefined, '^Test Child$'),
        ...permittedRows.map((row) => visible(row)),
        tap('account-back'),
        visible('tab-subjects', undefined, true),
        visible(
          'account-avatar-button',
          '^Open account settings for Test Child$',
        ),
        visibleWithDescendant(
          'subjects-browse-row-${SUBJECT_ID}',
          '^Child Learning Data$',
        ),
      ]),
    ).toBe(true);
    for (const row of ownerOnlyRows) {
      expect(selectorValues('id', commands)).not.toContain(row);
    }
  });

  it('requires the exact warm-before-cold hard sign-out YAML sequence', () => {
    expect(
      hasExactOwnerSignOutContract(parseMaestroCommands(ownerNative)),
    ).toBe(true);
  });

  it.each([
    'removed warm phase',
    'reordered warm phase',
    'optionalized assertion',
    'wrong owner',
    'wrong learning name',
    'adjacent child substitution',
  ])('rejects %s in the sign-out YAML contract', (mutationName) => {
    const commands = parseMaestroCommands(ownerNative);
    const mutation = cloneCommands(commands);
    const signOutIndex = mutation.findIndex((command) =>
      matchesMaestroCommand(command, tap('account-admin-sign-out')),
    );
    const backIndex = mutation.findIndex(
      (command, index) =>
        index > signOutIndex &&
        matchesMaestroCommand(command, { command: 'pressKey', value: 'back' }),
    );
    const warmLinkIndex = mutation.findIndex(
      (command, index) =>
        index > backIndex &&
        matchesMaestroCommand(command, {
          command: 'openLink',
          value: 'mentomate:///subjects',
        }),
    );
    expect(signOutIndex).toBeGreaterThanOrEqual(0);
    expect(backIndex).toBeGreaterThan(signOutIndex);
    expect(warmLinkIndex).toBeGreaterThan(backIndex);

    if (mutationName === 'removed warm phase') {
      mutation.splice(warmLinkIndex, 1);
    } else if (mutationName === 'reordered warm phase') {
      [mutation[backIndex], mutation[warmLinkIndex]] = [
        mutation[warmLinkIndex]!,
        mutation[backIndex]!,
      ];
    } else if (mutationName === 'optionalized assertion') {
      const ownerAbsence = mutation.find(
        (command, index) =>
          index > warmLinkIndex &&
          matchesMaestroCommand(command, absent(undefined, '^Test Parent$')),
      ) as Record<string, unknown>;
      const selector = ownerAbsence.assertNotVisible as Record<string, unknown>;
      selector.optional = true;
    } else if (mutationName === 'wrong owner') {
      replaceSelectorText(mutation, '^Test Parent$', '^Test Child$');
    } else if (mutationName === 'wrong learning name') {
      replaceSelectorText(mutation, '^General Knowledge$', '^Mathematics$');
    } else {
      replaceSelectorText(mutation, '^Test Parent$', '^Emma$');
      replaceSelectorText(mutation, '^General Knowledge$', '^Mathematics$');
    }

    expect(mutation).not.toEqual(commands);
    expect(hasExactOwnerSignOutContract(mutation)).toBe(false);
  });

  it('rejects a common ancestor whose siblings split a row id and title', () => {
    const commonAncestor = {
      assertVisible: {
        id: 'subjects-browse-list',
        containsDescendants: [
          { id: 'subjects-browse-row-${SUBJECT_ID}' },
          { text: '^Child Learning Data$' },
        ],
      },
    };
    expect(
      matchesMaestroCommand(
        commonAncestor,
        visibleWithDescendant(
          'subjects-browse-row-${SUBJECT_ID}',
          '^Child Learning Data$',
        ),
      ),
    ).toBe(false);
  });

  it('keeps every WI-2240 Maestro assertion hard', () => {
    expect(`${ownerNative}\n${nonOwnerNative}`).not.toMatch(
      /optional\s*:\s*true/,
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
  type LooseMaestroObject = Record<string, unknown>;
  const allObjects = (value: unknown): LooseMaestroObject[] => {
    if (Array.isArray(value)) return value.flatMap(allObjects);
    if (value === null || typeof value !== 'object') return [];
    return [
      value as LooseMaestroObject,
      ...Object.values(value).flatMap(allObjects),
    ];
  };

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

  it('[WI-2240] injects each Account flow subject ID without leaking the owner-only ID', () => {
    const harness = createMaestroHarness(0);

    try {
      const result = runCiMaestro(harness, { MAESTRO_CI_SUITE: 'v2' });
      const invocations = readFileSync(harness.maestroArgvMarker, 'utf8')
        .trim()
        .split('\n');
      const ownerInvocation = invocations.find((invocation) =>
        invocation.includes('apps/mobile/e2e/flows/v2/v2-account-owner.yaml'),
      );
      const nonOwnerInvocation = invocations.find((invocation) =>
        invocation.includes(
          'apps/mobile/e2e/flows/v2/v2-account-non-owner-child.yaml',
        ),
      );

      expect(result.status).toBe(0);
      expect(ownerInvocation).toBeDefined();
      expect(ownerInvocation).toContain('-e OWNER_SUBJECT_ID=owner-subject ');
      expect(nonOwnerInvocation).toBeDefined();
      expect(nonOwnerInvocation).toContain('-e SUBJECT_ID=non-owner-subject ');
      expect(nonOwnerInvocation).not.toContain('OWNER_SUBJECT_ID');
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
    const flows = plan.map(({ flow }) => flow);

    // WI-1864 repairs the two WI-2596 flow/fixture drifts and restores both
    // journeys to the explicit PR gate; the exact-head native run is their
    // unquarantine evidence.
    expect(plan).toHaveLength(13);
    expect(flows).toContain('flows/app-launch.yaml');
    expect(flows).toContain('flows/account/more-tab-navigation.yaml');
    expect(flows).toContain('flows/subjects/multi-subject.yaml');
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
      assertVisible?: { id?: string; optional?: boolean } | string;
      assertNotVisible?: { id?: string } | string;
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        timeout?: number;
        optional?: boolean;
      };
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
    const screenReady = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > settingsTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'child-mentor-memory-screen',
    );
    const populatedScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > screenReady &&
        scrollUntilVisible?.element?.id ===
          'child-mentor-memory-populated-category' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.optional !== true,
    );
    const populated = commands.findIndex(
      ({ assertVisible }, index) =>
        index > populatedScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'child-mentor-memory-populated-category' &&
        assertVisible.optional !== true,
    );
    const emptyAbsent = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > populated &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.id === 'child-mentor-memory-empty-state',
    );
    const soccer = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > emptyAbsent &&
        scrollUntilVisible?.element?.id === 'interest-context-Soccer-both' &&
        scrollUntilVisible.direction === 'UP',
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
    expect(screenReady).toBeGreaterThan(settingsTap);
    expect(populatedScroll).toBeGreaterThan(screenReady);
    expect(populated).toBeGreaterThan(populatedScroll);
    expect(emptyAbsent).toBeGreaterThan(populated);
    expect(soccer).toBeGreaterThan(emptyAbsent);
    expect(
      commands.filter(
        ({ tapOn }) =>
          tapOn?.id === 'parent-home-child-profile-${CHILD_PROFILE_ID}',
      ),
    ).toHaveLength(1);
    expect(source).not.toContain('parent-home-check-child-${CHILD_PROFILE_ID}');
    expect(source).not.toContain('What the mentor knows');
    expect(source).not.toContain('No learning observations yet.');
    expect(source).not.toContain('Interested in Soccer');
    expect(helperSource).toMatch(/id:\s*['"]child-detail-scroll['"]/);
    expect(helperSource).not.toMatch(/text:\s*['"]Recent sessions['"]/);
  });

  it('[WI-1864] accepts the mentor-memory footer control above the fixed tab bar', () => {
    for (const [flow, positioningOptional] of [
      ['child-mentor-memory.yaml', false],
      ['child-mentor-memory-populated.yaml', true],
    ] as const) {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e/flows/parent', flow),
        'utf8',
      );
      const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
        scrollUntilVisible?: {
          element?: { id?: string };
          visibilityPercentage?: number;
          centerElement?: boolean;
          optional?: boolean;
        };
        assertVisible?: { id?: string; optional?: boolean } | string;
      }>;
      const footerScroll = commands.findIndex(
        ({ scrollUntilVisible }) =>
          scrollUntilVisible?.element?.id === 'something-wrong-button',
      );
      const footerAssertion = commands.findIndex(
        ({ assertVisible }, index) =>
          index > footerScroll &&
          typeof assertVisible === 'object' &&
          assertVisible.id === 'something-wrong-button' &&
          assertVisible.optional !== true,
      );

      expect(commands[footerScroll]?.scrollUntilVisible).toMatchObject({
        visibilityPercentage: 50,
        centerElement: false,
        optional: positioningOptional,
      });
      expect(footerAssertion).toBeGreaterThan(footerScroll);
    }
  });

  it('[WI-1864] scrolls the empty mentor-memory correction input above the fixed tab bar', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/child-mentor-memory.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string; optional?: boolean };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
        optional?: boolean;
      };
      assertVisible?: { id?: string; optional?: boolean } | string;
    }>;
    const openCorrection = commands.findIndex(
      ({ tapOn }) =>
        tapOn?.id === 'something-wrong-button' && tapOn.optional !== true,
    );
    const inputScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > openCorrection &&
        scrollUntilVisible?.element?.id === 'correction-input' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 50 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional !== true,
    );
    const inputAssertion = commands.findIndex(
      ({ assertVisible }, index) =>
        index > inputScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'correction-input' &&
        assertVisible.optional !== true,
    );

    expect(openCorrection).toBeGreaterThan(-1);
    expect(inputScroll).toBeGreaterThan(openCorrection);
    expect(inputAssertion).toBeGreaterThan(inputScroll);
  });

  it('[WI-1864] seeds post-approval landing with an eligible zero-subject profile', () => {
    const manifest = JSON.parse(
      readFileSync(
        join(repoRoot, 'apps/mobile/e2e/ci-maestro-manifest.json'),
        'utf8',
      ),
    ) as { scenarioOverrides?: Record<string, string | null> };

    expect(
      manifest.scenarioOverrides?.['flows/consent/post-approval-landing.yaml'],
    ).toBe('post-approval-ready');

    for (const runner of [
      'regression-batch2.sh',
      'regression-batch3.sh',
      'regression-batch4b.sh',
      'rerun-failed.sh',
      'run-all-regression.sh',
      'run-all-untested.sh',
    ]) {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e/scripts', runner),
        'utf8',
      );

      expect(source).toMatch(
        /"post-approval-ready"\s+"flows\/consent\/post-approval-landing\.yaml"/,
      );
      expect(source).not.toMatch(
        /"onboarding-complete"\s+"flows\/consent\/post-approval-landing\.yaml"/,
      );
    }
  });

  it('[WI-1864] keeps post-approval copy and the hosted Mentor destination aligned with product behavior', () => {
    const flow = parseAllDocuments(
      readFileSync(
        join(
          repoRoot,
          'apps/mobile/e2e/flows/consent/post-approval-landing.yaml',
        ),
        'utf8',
      ),
    )
      .at(-1)
      ?.toJSON() as Array<{
      assertVisible?: { text?: string } | string;
      tapOn?: { id?: string; optional?: boolean } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
    }>;
    const english = JSON.parse(
      readFileSync(
        join(repoRoot, 'apps/mobile/src/i18n/locales/en.json'),
        'utf8',
      ),
    ) as {
      tabs: { postApproval: { title: string; parentApproved: string } };
    };

    expect(
      flow.flatMap(({ assertVisible }) =>
        typeof assertVisible === 'object' && assertVisible.text
          ? [assertVisible.text]
          : [],
      ),
    ).toEqual([
      english.tabs.postApproval.title,
      english.tabs.postApproval.parentApproved,
    ]);
    const continueTap = flow.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'post-approval-continue' &&
        tapOn.optional !== true,
    );
    const mentorLanding = flow.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > continueTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'mentor-screen' &&
        extendedWaitUntil.optional !== true,
    );

    expect(continueTap).toBeGreaterThan(-1);
    expect(mentorLanding).toBeGreaterThan(continueTap);
    expect(
      flow.some(
        ({ extendedWaitUntil }) =>
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'learner-screen',
      ),
    ).toBe(false);
  });

  it('[WI-1864] waits for the seeded parent child-detail session receipt', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/parent-dashboard.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      extendedWaitUntil?: {
        visible?: { id?: string; text?: string } | string;
        optional?: boolean;
      };
    }>;
    const sessions = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'recent-sessions-list' &&
        extendedWaitUntil.optional !== true,
    );
    const seededSession = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > sessions &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'session-card-${SESSION_ID}' &&
        extendedWaitUntil.optional !== true,
    );

    expect(sessions).toBeGreaterThan(-1);
    expect(seededSession).toBeGreaterThan(sessions);
    expect(source).not.toMatch(/text:\s*['"](?:Recent )?sessions['"]/i);
  });

  it('[WI-1864] retires the impossible no-subscription quiz journey', () => {
    const flow = 'flows/quiz/quiz-error-forbidden.yaml';
    const nightlyFlows = new Set(
      loadPlan('nightly').map((entry) => entry.flow),
    );
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e', flow),
      'utf8',
    );

    expect(nightlyFlows).not.toContain(flow);
    expect(source).toMatch(/^# RETIRED \(WI-1864\):/);
    expect(source).toMatch(/tags:\s*\n\s*- manual/);
    expect(source).toContain('free subscriptions are auto-provisioned');
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

  it('[WI-1864] waits for the standalone create-profile form by stable control', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/onboarding/create-profile-standalone.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | { text?: string } | string;
        optional?: boolean;
      };
    }>;
    const add = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' && tapOn.id === 'profiles-add-button',
    );
    const form = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > add &&
        typeof extendedWaitUntil?.visible === 'object' &&
        'id' in extendedWaitUntil.visible &&
        extendedWaitUntil.visible.id === 'create-profile-name' &&
        extendedWaitUntil.optional !== true,
    );
    const staleCopyWait = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        'text' in extendedWaitUntil.visible &&
        extendedWaitUntil.visible.text === 'New profile',
    );

    expect(add).toBeGreaterThan(-1);
    expect(form).toBeGreaterThan(add);
    expect(staleCopyWait).toBe(-1);
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
    for (const flow of [
      'consent/consent-pending-gate.yaml',
      'quiz/quiz-error-consent.yaml',
    ]) {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e/flows', flow),
        'utf8',
      );
      const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
        scrollUntilVisible?: {
          element?: { id?: string };
          direction?: string;
          optional?: boolean;
        };
        assertVisible?: { id?: string; optional?: boolean } | string;
        tapOn?: { id?: string; optional?: boolean } | string;
        extendedWaitUntil?: {
          visible?: { id?: string } | string;
          optional?: boolean;
        };
      }>;
      const scroll = commands.findIndex(
        ({ scrollUntilVisible }) =>
          scrollUntilVisible?.element?.id === 'consent-sign-out' &&
          scrollUntilVisible.direction === 'DOWN' &&
          scrollUntilVisible.optional !== true,
      );
      const assertion = commands.findIndex(
        ({ assertVisible }, index) =>
          index > scroll &&
          typeof assertVisible === 'object' &&
          assertVisible.id === 'consent-sign-out' &&
          assertVisible.optional !== true,
      );
      const tap = commands.findIndex(
        ({ tapOn }, index) =>
          index > assertion &&
          typeof tapOn === 'object' &&
          tapOn.id === 'consent-sign-out' &&
          tapOn.optional !== true,
      );
      const signedOut = commands.findIndex(
        ({ extendedWaitUntil }, index) =>
          index > tap &&
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'sign-in-button' &&
          extendedWaitUntil.optional !== true,
      );

      expect(scroll).toBeGreaterThan(-1);
      expect(assertion).toBeGreaterThan(scroll);
      expect(tap).toBeGreaterThan(assertion);
      expect(signedOut).toBeGreaterThan(tap);
    }
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

  it('[WI-1864] returns from the family-bridge session through the route-aware chat control', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/parent/family-bridge-from-recaps.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<
      | string
      | {
          assertVisible?: { id?: string } | string;
          assertNotVisible?: { id?: string } | string;
          extendedWaitUntil?: { visible?: { id?: string } | string };
          pressKey?: string;
          tapOn?: { id?: string } | string;
        }
    >;
    const session = commands.findIndex(
      (command) =>
        typeof command === 'object' &&
        typeof command.extendedWaitUntil?.visible === 'object' &&
        command.extendedWaitUntil.visible.id === 'session-screen',
    );
    const backVisible = commands.findIndex(
      (command, index) =>
        index > session &&
        typeof command === 'object' &&
        typeof command.assertVisible === 'object' &&
        command.assertVisible.id === 'chat-shell-back',
    );
    const backTap = commands.findIndex(
      (command, index) =>
        index > backVisible &&
        typeof command === 'object' &&
        typeof command.tapOn === 'object' &&
        command.tapOn.id === 'chat-shell-back',
    );
    const recap = commands.findIndex(
      (command, index) =>
        index > backTap &&
        typeof command === 'object' &&
        typeof command.extendedWaitUntil?.visible === 'object' &&
        command.extendedWaitUntil.visible.id === 'recap-detail-screen',
    );

    expect(session).toBeGreaterThan(-1);
    expect(backVisible).toBeGreaterThan(session);
    expect(backTap).toBeGreaterThan(backVisible);
    expect(recap).toBeGreaterThan(backTap);
    expect(
      commands
        .slice(session + 1, recap)
        .some(
          (command) =>
            typeof command === 'object' && command.pressKey === 'back',
        ),
    ).toBe(false);
  });

  it('[WI-1864] verifies the seeded My Notes session through its stable row id', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/learning/my-notes-archive.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      extendedWaitUntil?: { visible?: { id?: string } | string };
      assertVisible?: { id?: string; text?: string } | string;
    }>;
    const sessions = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'my-notes-list-sessions',
    );
    const seededRow = commands.findIndex(
      ({ assertVisible }, index) =>
        index > sessions &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'my-notes-row-sessions-${SESSION_ID}',
    );

    expect(sessions).toBeGreaterThan(-1);
    expect(seededRow).toBeGreaterThan(sessions);
    expect(source).not.toMatch(/text:\s*['"]Learning['"]/);
  });

  it('[WI-1864] navigates both axes of Other practice through a stable section heading', () => {
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
        timeout?: number;
        visibilityPercentage?: number;
        centerElement?: boolean;
        optional?: boolean;
      };
      tapOn?: { id?: string; optional?: boolean };
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
    }>;
    const heading = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'practice-other-practice-heading' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 50 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional === true,
    );
    const recitation = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > heading &&
        scrollUntilVisible?.element?.id === 'practice-recitation' &&
        scrollUntilVisible.direction === 'RIGHT' &&
        scrollUntilVisible.timeout === 10000 &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true &&
        scrollUntilVisible.optional !== true,
    );
    const recitationTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > recitation &&
        tapOn?.id === 'practice-recitation' &&
        tapOn.optional !== true,
    );
    const session = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > recitationTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'chat-input' &&
        extendedWaitUntil.optional !== true,
    );
    const chatBack = commands.findIndex(
      ({ tapOn }, index) =>
        index > session &&
        tapOn?.id === 'chat-shell-back' &&
        tapOn.optional !== true,
    );
    const practiceReturn = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > chatBack &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'practice-screen',
    );
    const secondHeading = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > practiceReturn &&
        scrollUntilVisible?.element?.id === 'practice-other-practice-heading' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 50 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional === true,
    );
    const dictation = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > secondHeading &&
        scrollUntilVisible?.element?.id === 'practice-dictation' &&
        scrollUntilVisible.direction === 'LEFT' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true &&
        scrollUntilVisible.optional !== true,
    );
    const dictationTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > dictation && tapOn?.id === 'practice-dictation',
    );

    expect(heading).toBeGreaterThan(-1);
    expect(recitation).toBeGreaterThan(heading);
    expect(recitationTap).toBeGreaterThan(recitation);
    expect(session).toBeGreaterThan(recitationTap);
    expect(chatBack).toBeGreaterThan(session);
    expect(practiceReturn).toBeGreaterThan(chatBack);
    expect(secondHeading).toBeGreaterThan(practiceReturn);
    expect(dictation).toBeGreaterThan(secondHeading);
    expect(dictationTap).toBeGreaterThan(dictation);
    expect(
      commands.some(
        ({ scrollUntilVisible }) =>
          scrollUntilVisible?.direction === 'DOWN' &&
          [
            'practice-other-practice-slider',
            'practice-recitation',
            'practice-dictation',
          ].includes(scrollUntilVisible.element?.id ?? ''),
      ),
    ).toBe(false);
  });

  it('[WI-1864] enters full dictation through both Practice scroll axes', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/dictation/dictation-full-flow.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
        optional?: boolean;
      };
      tapOn?: { id?: string };
    }>;
    const heading = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'practice-other-practice-heading' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 50 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional === true,
    );
    const dictation = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > heading &&
        scrollUntilVisible?.element?.id === 'practice-dictation' &&
        scrollUntilVisible.direction === 'LEFT' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true &&
        scrollUntilVisible.optional !== true,
    );
    const tap = commands.findIndex(
      ({ tapOn }, index) =>
        index > dictation && tapOn?.id === 'practice-dictation',
    );

    expect(heading).toBeGreaterThan(-1);
    expect(dictation).toBeGreaterThan(heading);
    expect(tap).toBeGreaterThan(dictation);
    expect(
      commands.some(
        ({ scrollUntilVisible }) =>
          scrollUntilVisible?.element?.id === 'practice-dictation' &&
          scrollUntilVisible.direction === 'DOWN',
      ),
    ).toBe(false);
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
        timeout?: number;
        visibilityPercentage?: number;
        centerElement?: boolean;
        optional?: boolean;
      };
      tapOn?: { id?: string; text?: string; optional?: boolean };
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
    }>;
    const heading = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'practice-other-practice-heading' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 50 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional === true,
    );
    const recitation = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > heading &&
        scrollUntilVisible?.element?.id === 'practice-recitation' &&
        scrollUntilVisible.direction === 'RIGHT' &&
        scrollUntilVisible.timeout === 10000 &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true &&
        scrollUntilVisible.optional !== true,
    );
    const tap = commands.findIndex(
      ({ tapOn }, index) =>
        index > recitation &&
        tapOn?.id === 'practice-recitation' &&
        tapOn.optional !== true,
    );
    const session = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > tap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'chat-input' &&
        extendedWaitUntil.optional !== true,
    );
    const endSession = commands.findIndex(
      ({ tapOn }, index) =>
        index > session &&
        tapOn?.id === 'end-session-button' &&
        tapOn.optional !== true,
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

    expect(heading).toBeGreaterThan(-1);
    expect(recitation).toBeGreaterThan(heading);
    expect(tap).toBeGreaterThan(recitation);
    expect(session).toBeGreaterThan(tap);
    expect(endSession).toBeGreaterThan(session);
    expect(confirmEnd).toBeGreaterThan(endSession);
    expect(summaryReady).toBeGreaterThan(confirmEnd);
    expect(closeSummary).toBeGreaterThan(summaryReady);
    expect(practiceReturn).toBeGreaterThan(closeSummary);
    expect(
      commands.some(
        ({ scrollUntilVisible }) =>
          scrollUntilVisible?.direction === 'DOWN' &&
          [
            'practice-other-practice-slider',
            'practice-recitation',
            'practice-dictation',
          ].includes(scrollUntilVisible.element?.id ?? ''),
      ),
    ).toBe(false);
  });

  it('[WI-1864] verifies recitation readiness through separate bubble and text receipts', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/practice/recitation-session.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string; optional?: boolean } | string;
      inputText?: string;
      extendedWaitUntil?: {
        visible?: { id?: string; text?: string } | string;
        timeout?: number;
        optional?: boolean;
      };
      assertVisible?:
        | { id?: string; text?: string; optional?: boolean }
        | string;
      assertNotVisible?:
        | { id?: string; text?: string; optional?: boolean }
        | string;
    }>;
    const title = commands.findIndex(
      ({ inputText }) => inputText === 'Ozymandias',
    );
    const submit = commands.findIndex(
      ({ tapOn }, index) =>
        index > title &&
        typeof tapOn === 'object' &&
        tapOn.id === 'send-button' &&
        tapOn.optional !== true,
    );
    const bubbleReceipt = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > submit &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'message-bubble-assistant-2' &&
        extendedWaitUntil.visible.text === undefined &&
        (extendedWaitUntil.timeout ?? 0) >= 60000 &&
        extendedWaitUntil.optional !== true,
    );
    const readinessText = commands.findIndex(
      ({ assertVisible }, index) =>
        index > bubbleReceipt &&
        typeof assertVisible === 'object' &&
        assertVisible.id === undefined &&
        assertVisible.text ===
          '(?i)^ready when you are.*begin your recitation from memory[.]?$' &&
        assertVisible.optional !== true,
    );
    const refusalAbsent = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > readinessText &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.id === undefined &&
        assertNotVisible.text ===
          '(?i)^I don.t have reliable source material.*' &&
        assertNotVisible.optional !== true,
    );

    expect(title).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(title);
    expect(bubbleReceipt).toBeGreaterThan(submit);
    expect(readinessText).toBeGreaterThan(bubbleReceipt);
    expect(refusalAbsent).toBeGreaterThan(readinessText);
  });

  it('[WI-1864] follows automatic quiz completion to every below-fold result control', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/quiz/quiz-full-flow.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      repeat?: { times?: number };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        optional?: boolean;
      };
      tapOn?: { id?: string; optional?: boolean } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
      assertVisible?: { id?: string; optional?: boolean } | string;
    }>;
    const roundLoop = commands.findIndex(({ repeat }) => repeat?.times === 12);
    const resultsScreen = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > roundLoop &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'quiz-results-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const doneScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > resultsScreen &&
        scrollUntilVisible?.element?.id === 'quiz-results-done' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.optional !== true,
    );
    const doneAssert = commands.findIndex(
      ({ assertVisible }, index) =>
        index > doneScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'quiz-results-done' &&
        assertVisible.optional !== true,
    );
    const historyScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > doneAssert &&
        scrollUntilVisible?.element?.id === 'quiz-results-history' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.optional !== true,
    );
    const historyAssert = commands.findIndex(
      ({ assertVisible }, index) =>
        index > historyScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'quiz-results-history' &&
        assertVisible.optional !== true,
    );
    const historyTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > historyAssert &&
        typeof tapOn === 'object' &&
        tapOn.id === 'quiz-results-history' &&
        tapOn.optional !== true,
    );
    const finalCtaReferences = JSON.stringify(commands).match(
      /quiz-final-see-results/g,
    );

    expect(roundLoop).toBeGreaterThan(-1);
    expect(resultsScreen).toBeGreaterThan(roundLoop);
    expect(doneScroll).toBeGreaterThan(resultsScreen);
    expect(doneAssert).toBeGreaterThan(doneScroll);
    expect(historyScroll).toBeGreaterThan(doneAssert);
    expect(historyAssert).toBeGreaterThan(historyScroll);
    expect(historyTap).toBeGreaterThan(historyAssert);
    expect(finalCtaReferences).toBeNull();
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

  it('[WI-1864] verifies parent More rows without leaving them above the viewport', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/parent-tabs.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      assertVisible?: { id?: string; optional?: boolean } | string;
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
        optional?: boolean;
      };
    }>;
    const learningPreferences = commands.findIndex(
      ({ assertVisible }) =>
        typeof assertVisible === 'object' &&
        assertVisible.id === 'more-row-learning-preferences' &&
        assertVisible.optional !== true,
    );
    const accountScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > learningPreferences &&
        scrollUntilVisible?.element?.id === 'more-row-account' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional !== true,
    );
    const account = commands.findIndex(
      ({ assertVisible }, index) =>
        index > accountScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'more-row-account' &&
        assertVisible.optional !== true,
    );
    const notificationsScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > account &&
        scrollUntilVisible?.element?.id === 'more-row-notifications' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional !== true,
    );
    const notifications = commands.findIndex(
      ({ assertVisible }, index) =>
        index > notificationsScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'more-row-notifications' &&
        assertVisible.optional !== true,
    );

    expect([
      learningPreferences,
      accountScroll,
      account,
      notificationsScroll,
      notifications,
    ]).toEqual(
      [
        learningPreferences,
        accountScroll,
        account,
        notificationsScroll,
        notifications,
      ].toSorted((left, right) => left - right),
    );
    expect(learningPreferences).toBeGreaterThan(-1);
    expect(
      commands.some(
        ({ scrollUntilVisible }) =>
          scrollUntilVisible?.element?.id === 'sign-out-button',
      ),
    ).toBe(false);
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

  it.each([
    ['child-report-detail.yaml', '${CHILD_PROFILE_ID}'],
    ['child-weekly-report.yaml', '${CHILD_PROFILE_ID}'],
    ['child-reports-empty.yaml', '${CHILD1_PROFILE_ID}'],
  ])(
    '[WI-1864] scrolls to weekly reports from parent home without double navigation: %s',
    (flow, childProfileId) => {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e/flows/parent', flow),
        'utf8',
      );
      const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
        runFlow?: { file?: string };
        extendedWaitUntil?: { visible?: { id?: string } | string };
        scrollUntilVisible?: {
          element?: { id?: string };
          direction?: string;
          visibilityPercentage?: number;
          centerElement?: boolean;
        };
        tapOn?: { id?: string };
      }>;
      const parentHome = commands.findIndex(
        ({ extendedWaitUntil }) =>
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'parent-home-screen',
      );
      const reportScroll = commands.findIndex(
        ({ scrollUntilVisible }, index) =>
          index > parentHome &&
          scrollUntilVisible?.element?.id ===
            `parent-home-weekly-report-${childProfileId}` &&
          scrollUntilVisible.direction === 'DOWN' &&
          scrollUntilVisible.visibilityPercentage === 100 &&
          scrollUntilVisible.centerElement === true,
      );
      const reportTap = commands.findIndex(
        ({ tapOn }, index) =>
          index > reportScroll &&
          tapOn?.id === `parent-home-weekly-report-${childProfileId}`,
      );

      expect(
        commands.some(
          ({ runFlow }) =>
            runFlow?.file === '../_setup/open-family-dashboard.yaml',
        ),
      ).toBe(false);
      expect(parentHome).toBeGreaterThan(-1);
      expect(reportScroll).toBeGreaterThan(parentHome);
      expect(reportTap).toBeGreaterThan(reportScroll);
    },
  );

  it('[WI-1864] ends the empty child-report journey at its proven empty-state receipt', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/child-reports-empty.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      assertVisible?: { id?: string; optional?: boolean } | string;
      takeScreenshot?: string;
    }>;
    const empty = commands.findIndex(
      ({ assertVisible }) =>
        typeof assertVisible === 'object' &&
        assertVisible.id === 'child-reports-empty' &&
        assertVisible.optional !== true,
    );
    const context = commands.findIndex(
      ({ assertVisible }, index) =>
        index > empty &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'child-reports-empty-time-context' &&
        assertVisible.optional !== true,
    );
    const progress = commands.findIndex(
      ({ assertVisible }, index) =>
        index > context &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'child-reports-empty-progress' &&
        assertVisible.optional !== true,
    );
    const receipt = commands.findIndex(
      ({ takeScreenshot }, index) =>
        index > progress && takeScreenshot === '03-reports-empty',
    );

    expect(empty).toBeGreaterThan(-1);
    expect(context).toBeGreaterThan(empty);
    expect(progress).toBeGreaterThan(context);
    expect(receipt).toBeGreaterThan(progress);
    expect(commands.slice(receipt + 1)).toEqual([]);
  });

  it('[WI-1864] reaches every populated child-report section on a small viewport', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/child-report-detail.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      assertVisible?: { id?: string; optional?: boolean } | string;
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        optional?: boolean;
      };
    }>;
    const requiredScroll = (id: string, after: number) =>
      commands.findIndex(
        ({ scrollUntilVisible }, index) =>
          index > after &&
          scrollUntilVisible?.element?.id === id &&
          scrollUntilVisible.direction === 'DOWN' &&
          scrollUntilVisible.optional !== true,
      );
    const requiredAssertion = (id: string, after: number) =>
      commands.findIndex(
        ({ assertVisible }, index) =>
          index > after &&
          typeof assertVisible === 'object' &&
          assertVisible.id === id &&
          assertVisible.optional !== true,
      );

    const highlightsScroll = requiredScroll('child-report-highlights', -1);
    const highlights = requiredAssertion(
      'child-report-highlights',
      highlightsScroll,
    );
    const nextStepsScroll = requiredScroll(
      'child-report-next-steps',
      highlights,
    );
    const nextSteps = requiredAssertion(
      'child-report-next-steps',
      nextStepsScroll,
    );
    const subjectsScroll = requiredScroll('child-report-subjects', nextSteps);
    const subjects = requiredAssertion('child-report-subjects', subjectsScroll);

    expect(highlightsScroll).toBeGreaterThan(-1);
    expect(highlights).toBeGreaterThan(highlightsScroll);
    expect(nextStepsScroll).toBeGreaterThan(highlights);
    expect(nextSteps).toBeGreaterThan(nextStepsScroll);
    expect(subjectsScroll).toBeGreaterThan(nextSteps);
    expect(subjects).toBeGreaterThan(subjectsScroll);
  });

  it('[WI-1864] submits password recovery for the runner-injected shard identity', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/auth/forgot-password.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      inputText?: string;
      pressKey?: string;
      tapOn?: { id?: string } | string;
    }>;
    const email = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' && tapOn.id === 'forgot-password-email',
    );
    const injectedIdentity = commands.findIndex(
      ({ inputText }, index) => index > email && inputText === '${EMAIL}',
    );
    const submit = commands.findIndex(
      ({ tapOn }, index) =>
        index > injectedIdentity &&
        typeof tapOn === 'object' &&
        tapOn.id === 'send-reset-code-button',
    );
    const passwordInput = commands.findIndex(
      ({ tapOn }, index) =>
        index > submit &&
        typeof tapOn === 'object' &&
        tapOn.id === 'reset-new-password',
    );
    const passwordValue = commands.findIndex(
      ({ inputText }, index) =>
        index > passwordInput && inputText === 'E2eTest_2026xK!',
    );
    const keyboardDismiss = commands.findIndex(
      ({ pressKey }, index) => index > passwordValue && pressKey === 'Back',
    );
    const reset = commands.findIndex(
      ({ tapOn }, index) =>
        index > keyboardDismiss &&
        typeof tapOn === 'object' &&
        tapOn.id === 'reset-password-button',
    );
    const ambiguousSubmit = commands.findIndex(
      ({ tapOn }, index) =>
        index > passwordValue && index < reset && tapOn === 'Reset password',
    );

    expect(email).toBeGreaterThan(-1);
    expect(injectedIdentity).toBeGreaterThan(email);
    expect(submit).toBeGreaterThan(injectedIdentity);
    expect(passwordInput).toBeGreaterThan(submit);
    expect(passwordValue).toBeGreaterThan(passwordInput);
    expect(keyboardDismiss).toBeGreaterThan(passwordValue);
    expect(reset).toBeGreaterThan(keyboardDismiss);
    expect(ambiguousSubmit).toBe(-1);
    expect(source).not.toContain('test-e2e+clerk_test@example.com');
  });

  it('[WI-1864] waits for the stable inline nudge rate-limit receipt', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/nudge-rate-limit.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        timeout?: number;
        visibilityPercentage?: number;
        centerElement?: boolean;
        optional?: boolean;
      };
      tapOn?: { id?: string; optional?: boolean } | string;
    }>;
    const opener = 'parent-home-send-nudge-${CHILD_PROFILE_ID}';
    const templates = [
      'nudge-template-you_got_this',
      'nudge-template-proud_of_you',
      'nudge-template-quick_session',
      'nudge-template-thinking_of_you',
      'nudge-template-you_got_this',
    ];
    const journey: number[] = [];
    let cursor = -1;
    for (const [attempt, template] of templates.entries()) {
      const openSheet = commands.findIndex(
        ({ tapOn }, index) =>
          index > cursor &&
          typeof tapOn === 'object' &&
          tapOn.id === opener &&
          tapOn.optional !== true,
      );
      const templateReady = commands.findIndex(
        ({ extendedWaitUntil }, index) =>
          index > openSheet &&
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === template &&
          extendedWaitUntil.optional !== true,
      );
      const templateTap = commands.findIndex(
        ({ tapOn }, index) =>
          index > templateReady &&
          typeof tapOn === 'object' &&
          tapOn.id === template &&
          tapOn.optional !== true,
      );
      journey.push(openSheet, templateReady, templateTap);

      if (attempt < templates.length - 1) {
        const returnedHome = commands.findIndex(
          ({ extendedWaitUntil }, index) =>
            index > templateTap &&
            typeof extendedWaitUntil?.visible === 'object' &&
            extendedWaitUntil.visible.id === 'parent-home-screen' &&
            extendedWaitUntil.optional !== true,
        );
        journey.push(returnedHome);
        cursor = returnedHome;
      } else {
        cursor = templateTap;
      }
    }
    const rateLimitReceipt = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > cursor &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'nudge-inline-error-rate' &&
        extendedWaitUntil.optional !== true,
    );
    journey.push(rateLimitReceipt);

    expect(journey).toEqual(journey.toSorted((left, right) => left - right));
    expect(journey[0]).toBeGreaterThan(-1);
  });

  it('[WI-1864] exercises the seeded fourth-failure remediation before relearn', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/retention/failed-recall.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      runFlow?: {
        file?: string;
        env?: Record<string, string>;
      };
      openLink?: string;
      assertVisible?:
        | {
            id?: string;
            text?: string;
            optional?: boolean;
          }
        | string;
      assertNotVisible?: { text?: string; optional?: boolean } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
      tapOn?: { id?: string; optional?: boolean } | string;
    }>;
    const seeded = commands.findIndex(
      ({ runFlow }) =>
        runFlow?.file === '../_setup/seed-and-sign-in.yaml' &&
        runFlow.env?.SEED_SCENARIO === 'failed-recall-3x',
    );
    const learner = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'learner-screen',
    );
    const recallDeepLink = commands.findIndex(
      ({ openLink }, index) =>
        index > learner &&
        openLink ===
          'mentomate:///topic/recall-test?topicId=${TOPIC_ID}&subjectId=${SUBJECT_ID}',
    );
    const recallScreen = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > recallDeepLink &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'recall-test-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const failedAttempt = commands.findIndex(
      ({ tapOn }, index) =>
        index > recallScreen &&
        typeof tapOn === 'object' &&
        tapOn.id === 'recall-dont-remember-button' &&
        tapOn.optional !== true,
    );
    const remediation = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > failedAttempt &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'remediation-card' &&
        extendedWaitUntil.optional !== true,
    );
    const remediationActions = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > remediation &&
        scrollUntilVisible?.element?.id === 'review-retest-button' &&
        scrollUntilVisible.direction === 'DOWN' &&
        (scrollUntilVisible.timeout ?? 0) >= 10000 &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true &&
        scrollUntilVisible.optional !== true,
    );
    const reviewAction = commands.findIndex(
      ({ assertVisible }, index) =>
        index > remediationActions &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'review-retest-button' &&
        assertVisible.optional !== true,
    );
    const relearnAction = commands.findIndex(
      ({ assertVisible }, index) =>
        index > reviewAction &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'relearn-topic-button' &&
        assertVisible.optional !== true,
    );
    const relearnTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > relearnAction &&
        typeof tapOn === 'object' &&
        tapOn.id === 'relearn-topic-button' &&
        tapOn.optional !== true,
    );
    const methodPhase = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > relearnTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'relearn-method-phase' &&
        extendedWaitUntil.optional !== true,
    );
    const method = commands.findIndex(
      ({ tapOn }, index) =>
        index > methodPhase &&
        typeof tapOn === 'object' &&
        tapOn.id === 'relearn-method-step_by_step' &&
        tapOn.optional !== true,
    );
    const session = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > method &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'chat-input' &&
        extendedWaitUntil.optional !== true,
    );

    const remediationJourney = [
      seeded,
      learner,
      recallDeepLink,
      recallScreen,
      failedAttempt,
      remediation,
      remediationActions,
      reviewAction,
      relearnAction,
      relearnTap,
      methodPhase,
      method,
      session,
    ];
    expect(remediationJourney).toEqual(
      remediationJourney.toSorted((left, right) => left - right),
    );
    expect(seeded).toBeGreaterThan(-1);
    expect(source).not.toContain('home-subject-carousel');
    expect(source).not.toContain('home-coach-band-continue');
  });

  it.each([
    ['nudge-rate-limit.yaml', 5],
    ['send-nudge.yaml', 1],
  ])(
    '[WI-1864] scrolls the first parent nudge action fully into the small viewport: %s',
    (flow, expectedTaps) => {
      const source = readFileSync(
        join(repoRoot, 'apps/mobile/e2e/flows/parent', flow),
        'utf8',
      );
      const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
        extendedWaitUntil?: { visible?: { id?: string } | string };
        scrollUntilVisible?: {
          element?: { id?: string };
          direction?: string;
          timeout?: number;
          visibilityPercentage?: number;
          centerElement?: boolean;
          optional?: boolean;
        };
        tapOn?: { id?: string } | string;
      }>;
      const selector = 'parent-home-send-nudge-${CHILD_PROFILE_ID}';
      const home = commands.findIndex(
        ({ extendedWaitUntil }) =>
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'parent-home-screen',
      );
      const scroll = commands.findIndex(
        ({ scrollUntilVisible }, index) =>
          index > home &&
          scrollUntilVisible?.element?.id === selector &&
          scrollUntilVisible.direction === 'DOWN' &&
          (scrollUntilVisible.timeout ?? 0) >= 30000 &&
          scrollUntilVisible.visibilityPercentage === 100 &&
          scrollUntilVisible.centerElement === true &&
          scrollUntilVisible.optional !== true,
      );
      const taps = commands
        .map(({ tapOn }, index) => ({ tapOn, index }))
        .filter(
          ({ tapOn }) => typeof tapOn === 'object' && tapOn.id === selector,
        );

      expect(home).toBeGreaterThan(-1);
      expect(scroll).toBeGreaterThan(home);
      expect(taps).toHaveLength(expectedTaps);
      expect(taps[0]?.index).toBeGreaterThan(scroll);
    },
  );

  it('[WI-1864] opens empty mentor memory through child settings mode', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/child-mentor-memory.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string } | string;
      extendedWaitUntil?: { visible?: { id?: string } | string };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        optional?: boolean;
      };
      assertVisible?: { id?: string; optional?: boolean } | string;
    }>;
    const settings = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'parent-home-child-profile-${CHILD1_PROFILE_ID}',
    );
    const detail = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > settings &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'child-detail-scroll',
    );
    const mentorMemoryScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > detail &&
        scrollUntilVisible?.element?.id === 'mentor-memory-link' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.optional !== true,
    );
    const mentorMemoryTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > mentorMemoryScroll &&
        typeof tapOn === 'object' &&
        tapOn.id === 'mentor-memory-link',
    );
    const memoryScreen = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > mentorMemoryTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'child-mentor-memory-screen',
    );
    const emptyScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > memoryScreen &&
        scrollUntilVisible?.element?.id === 'child-mentor-memory-empty-state' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.optional !== true,
    );
    const emptyAssertion = commands.findIndex(
      ({ assertVisible }, index) =>
        index > emptyScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'child-mentor-memory-empty-state' &&
        assertVisible.optional !== true,
    );

    expect(settings).toBeGreaterThan(-1);
    expect(detail).toBeGreaterThan(settings);
    expect(mentorMemoryScroll).toBeGreaterThan(detail);
    expect(mentorMemoryTap).toBeGreaterThan(mentorMemoryScroll);
    expect(memoryScreen).toBeGreaterThan(mentorMemoryTap);
    expect(emptyScroll).toBeGreaterThan(memoryScreen);
    expect(emptyAssertion).toBeGreaterThan(emptyScroll);
    expect(source).not.toContain(
      'parent-home-check-child-${CHILD1_PROFILE_ID}',
    );
    expect(source).not.toContain('No learning observations yet.');
  });

  it('[WI-1864] deep-links to the supported subject-progress resume route', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/progress/resume-progress-subject.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      openLink?: string;
      extendedWaitUntil?: {
        visible?: { id?: string; text?: string } | string;
        optional?: boolean;
      };
      tapOn?: { id?: string } | string;
    }>;
    const deepLink = commands.findIndex(
      ({ openLink }) => openLink === 'mentomate:///progress/${SUBJECT_ID}',
    );
    const detail = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > deepLink &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'progress-subject-back',
    );
    const ready = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > detail &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'progress-subject-resume' &&
        extendedWaitUntil.visible.text === 'Resume' &&
        extendedWaitUntil.optional !== true,
    );
    const resume = commands.findIndex(
      ({ tapOn }, index) =>
        index > ready &&
        typeof tapOn === 'object' &&
        tapOn.id === 'progress-subject-resume',
    );

    expect(deepLink).toBeGreaterThan(-1);
    expect(detail).toBeGreaterThan(deepLink);
    expect(ready).toBeGreaterThan(detail);
    expect(resume).toBeGreaterThan(ready);
    expect(source).not.toContain('home-subject-card-${SUBJECT_ID}');
  });

  it('[WI-1864] keeps home subject analytics on the current shelf route', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/progress/progress-analytics.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
        optional?: boolean;
      };
      tapOn?: { id?: string } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
    }>;
    const subjectSection = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'home-subjects-heading' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 50 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional === true,
    );
    const subjectScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > subjectSection &&
        scrollUntilVisible?.element?.id === 'home-subject-card-${SUBJECT_ID}' &&
        scrollUntilVisible.direction === 'RIGHT' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional !== true,
    );
    const subject = commands.findIndex(
      ({ tapOn }, index) =>
        index > subjectScroll &&
        typeof tapOn === 'object' &&
        tapOn.id === 'home-subject-card-${SUBJECT_ID}',
    );
    const shelf = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > subject &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'shelf-screen',
    );
    const back = commands.findIndex(
      ({ tapOn }, index) =>
        index > shelf && typeof tapOn === 'object' && tapOn.id === 'shelf-back',
    );
    const library = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > back &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'library-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const progressTab = commands.findIndex(
      ({ tapOn }, index) =>
        index > library &&
        typeof tapOn === 'object' &&
        tapOn.id === 'tab-progress',
    );
    const progress = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > progressTab &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'progress-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const expand = commands.findIndex(
      ({ tapOn }, index) =>
        index > progress &&
        typeof tapOn === 'object' &&
        tapOn.id === 'progress-show-all-sessions',
    );
    const recent = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > expand &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'recent-sessions-list' &&
        extendedWaitUntil.optional !== true,
    );
    const seededSession = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > recent &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'session-card-${SESSION_ID}' &&
        extendedWaitUntil.optional !== true,
    );

    expect(subjectSection).toBeGreaterThan(-1);
    expect(subjectScroll).toBeGreaterThan(subjectSection);
    expect(subject).toBeGreaterThan(subjectScroll);
    expect(shelf).toBeGreaterThan(subject);
    expect(back).toBeGreaterThan(shelf);
    expect(library).toBeGreaterThan(back);
    expect(progressTab).toBeGreaterThan(library);
    expect(progress).toBeGreaterThan(progressTab);
    expect(expand).toBeGreaterThan(progress);
    expect(recent).toBeGreaterThan(expand);
    expect(seededSession).toBeGreaterThan(recent);
    expect(source).not.toContain('progress-subject-back');
  });

  it('[WI-1864] opens a multi-subject home card on its shelf before returning home', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/subjects/multi-subject.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
    }>;
    const subject = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'home-subject-card-${ACTIVE_SUBJECT_ID}',
    );
    const shelf = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > subject &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'shelf-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const back = commands.findIndex(
      ({ tapOn }, index) =>
        index > shelf && typeof tapOn === 'object' && tapOn.id === 'shelf-back',
    );
    const library = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > back &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'shelves-list' &&
        extendedWaitUntil.optional !== true,
    );
    const homeTab = commands.findIndex(
      ({ tapOn }, index) =>
        index > library && typeof tapOn === 'object' && tapOn.id === 'tab-home',
    );
    const home = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > homeTab &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'learner-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const staleProgressWait = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'progress-subject-back',
    );

    expect(subject).toBeGreaterThan(-1);
    expect(shelf).toBeGreaterThan(subject);
    expect(back).toBeGreaterThan(shelf);
    expect(library).toBeGreaterThan(back);
    expect(homeTab).toBeGreaterThan(library);
    expect(home).toBeGreaterThan(homeTab);
    expect(staleProgressWait).toBe(-1);
  });

  it('[WI-1864] scrolls through every off-screen populated recap control before using it', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/child-session-recap.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        optional?: boolean;
      };
      assertVisible?: { id?: string; optional?: boolean } | string;
      tapOn?: { id?: string; optional?: boolean } | string;
    }>;
    const mandatoryScrollAfter = (id: string, after: number) =>
      commands.findIndex(
        ({ scrollUntilVisible }, index) =>
          index > after &&
          scrollUntilVisible?.element?.id === id &&
          scrollUntilVisible.direction === 'DOWN' &&
          scrollUntilVisible.optional !== true,
      );
    const mandatoryAssertAfter = (id: string, after: number) =>
      commands.findIndex(
        ({ assertVisible }, index) =>
          index > after &&
          typeof assertVisible === 'object' &&
          assertVisible.id === id &&
          assertVisible.optional !== true,
      );
    const mandatoryTapAfter = (id: string, after: number) =>
      commands.findIndex(
        ({ tapOn }, index) =>
          index > after &&
          typeof tapOn === 'object' &&
          tapOn.id === id &&
          tapOn.optional !== true,
      );

    const engagementScroll = mandatoryScrollAfter(
      'engagement-chip-curious',
      -1,
    );
    const engagement = mandatoryAssertAfter(
      'engagement-chip-curious',
      engagementScroll,
    );
    const promptScroll = mandatoryScrollAfter(
      'session-recap-conversation-prompt',
      engagement,
    );
    const prompt = mandatoryAssertAfter(
      'session-recap-conversation-prompt',
      promptScroll,
    );
    const copyScroll = mandatoryScrollAfter(
      'session-recap-copy-prompt',
      prompt,
    );
    const copy = mandatoryTapAfter('session-recap-copy-prompt', copyScroll);
    const backScroll = mandatoryScrollAfter(
      'session-detail-back-to-child',
      copy,
    );
    const back = mandatoryTapAfter('session-detail-back-to-child', backScroll);

    expect(engagementScroll).toBeGreaterThan(-1);
    expect(engagement).toBeGreaterThan(engagementScroll);
    expect(promptScroll).toBeGreaterThan(engagement);
    expect(prompt).toBeGreaterThan(promptScroll);
    expect(copyScroll).toBeGreaterThan(prompt);
    expect(copy).toBeGreaterThan(copyScroll);
    expect(backScroll).toBeGreaterThan(copy);
    expect(back).toBeGreaterThan(backScroll);
  });

  it('[WI-1864] reaches the below-fold recap session receipt before restoring the header back control', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/parent/recap-detail-navigation.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
        optional?: boolean;
      };
      assertVisible?: { id?: string; optional?: boolean } | string;
      tapOn?: { id?: string; optional?: boolean } | string;
    }>;

    const sessionScroll = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'recap-detail-open-session' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === true &&
        scrollUntilVisible.optional !== true,
    );
    const sessionReceipt = commands.findIndex(
      ({ assertVisible }, index) =>
        index > sessionScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'recap-detail-open-session' &&
        assertVisible.optional !== true,
    );
    const backScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > sessionReceipt &&
        scrollUntilVisible?.element?.id === 'recap-detail-back' &&
        scrollUntilVisible.direction === 'UP' &&
        scrollUntilVisible.visibilityPercentage === 100 &&
        scrollUntilVisible.centerElement === false &&
        scrollUntilVisible.optional !== true,
    );
    const back = commands.findIndex(
      ({ tapOn }, index) =>
        index > backScroll &&
        typeof tapOn === 'object' &&
        tapOn.id === 'recap-detail-back' &&
        tapOn.optional !== true,
    );

    expect(sessionScroll).toBeGreaterThan(-1);
    expect(sessionReceipt).toBeGreaterThan(sessionScroll);
    expect(backScroll).toBeGreaterThan(sessionReceipt);
    expect(back).toBeGreaterThan(backScroll);
  });

  it('[WI-1864] verifies the multi-child family summary at its below-fold position', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/multi-child-dashboard.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        optional?: boolean;
      };
      assertVisible?: { id?: string; optional?: boolean } | string;
    }>;
    const child3 = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id ===
          'parent-home-check-child-${CHILD3_PROFILE_ID}' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.optional !== true,
    );
    const summaryScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > child3 &&
        scrollUntilVisible?.element?.id === 'parent-home-family-summary' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.optional !== true,
    );
    const summaryAssert = commands.findIndex(
      ({ assertVisible }, index) =>
        index > summaryScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'parent-home-family-summary' &&
        assertVisible.optional !== true,
    );
    const child1Return = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > summaryAssert &&
        scrollUntilVisible?.element?.id ===
          'parent-home-check-child-${CHILD1_PROFILE_ID}' &&
        scrollUntilVisible.direction === 'UP' &&
        scrollUntilVisible.optional !== true,
    );
    const prematureSummaryAssert = commands.findIndex(
      ({ assertVisible }, index) =>
        index < summaryScroll &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'parent-home-family-summary',
    );

    expect(child3).toBeGreaterThan(-1);
    expect(summaryScroll).toBeGreaterThan(child3);
    expect(summaryAssert).toBeGreaterThan(summaryScroll);
    expect(child1Return).toBeGreaterThan(summaryAssert);
    expect(prematureSummaryAssert).toBe(-1);
  });

  it('[WI-1864] returns from every multi-child detail through the route-aware app back control', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/parent/multi-child-dashboard.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string; optional?: boolean } | string;
      pressKey?: string;
      extendedWaitUntil?: {
        visible?: { id?: string; text?: string } | string;
        optional?: boolean;
      };
    }>;
    const hardwareBacks = commands.filter(
      ({ pressKey }) => pressKey?.toLowerCase() === 'back',
    );
    const routeAwareBacks = commands.filter(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'back-button' &&
        tapOn.optional !== true,
    );

    let cursor = -1;
    for (const childName of ['Emma', 'Lucas', 'Sofia']) {
      const detail = commands.findIndex(
        ({ extendedWaitUntil }, index) =>
          index > cursor &&
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.text === childName &&
          extendedWaitUntil.optional !== true,
      );
      const appBack = commands.findIndex(
        ({ tapOn }, index) =>
          index > detail &&
          typeof tapOn === 'object' &&
          tapOn.id === 'back-button' &&
          tapOn.optional !== true,
      );
      const parentHome = commands.findIndex(
        ({ extendedWaitUntil }, index) =>
          index > appBack &&
          typeof extendedWaitUntil?.visible === 'object' &&
          extendedWaitUntil.visible.id === 'parent-home-screen' &&
          extendedWaitUntil.optional !== true,
      );

      expect(detail).toBeGreaterThan(cursor);
      expect(appBack).toBeGreaterThan(detail);
      expect(parentHome).toBeGreaterThan(appBack);
      cursor = parentHome;
    }

    expect(routeAwareBacks).toHaveLength(3);
    expect(hardwareBacks).toHaveLength(0);
  });

  it('[WI-1864] waits for the Google SSO browser before cancelling it', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/auth/sso-user-cancel.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string; optional?: boolean } | string;
      extendedWaitUntil?: {
        visible?: string | { id?: string };
        timeout?: number;
        optional?: boolean;
      };
      pressKey?: string;
    }>;
    const googleTap = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'google-sso-button' &&
        tapOn.optional !== true,
    );
    const browserWait = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > googleTap &&
        typeof extendedWaitUntil?.visible === 'string' &&
        new RegExp(extendedWaitUntil.visible).test(
          'https://accounts.google.com/o/oauth2/auth',
        ) &&
        !new RegExp(extendedWaitUntil.visible).test('Welcome to MentoMate') &&
        !new RegExp(extendedWaitUntil.visible).test('Continue with Google') &&
        !new RegExp(extendedWaitUntil.visible).test('') &&
        (extendedWaitUntil.timeout ?? 0) >= 15000 &&
        extendedWaitUntil.optional !== true,
    );
    const firstBackAfterTap = commands.findIndex(
      ({ pressKey }, index) => index > googleTap && pressKey === 'back',
    );

    expect(googleTap).toBeGreaterThan(-1);
    expect(browserWait).toBeGreaterThan(googleTap);
    expect(firstBackAfterTap).toBeGreaterThan(browserWait);
  });

  it('[WI-1864] scrolls down from the top of Home to open subject resolution', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/onboarding/create-subject-resolve.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        optional?: boolean;
      };
      tapOn?: { id?: string; optional?: boolean } | string;
    }>;
    const studyAction = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'home-action-study-new' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.optional !== true,
    );
    const open = commands.findIndex(
      ({ tapOn }, index) =>
        index > studyAction &&
        typeof tapOn === 'object' &&
        tapOn.id === 'home-action-study-new' &&
        tapOn.optional !== true,
    );

    expect(studyAction).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(studyAction);
  });

  it('[WI-1864] accepts the current confident subject-resolution receipt', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/onboarding/create-subject-resolve.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string; optional?: boolean } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        timeout?: number;
        optional?: boolean;
      };
    }>;
    const submit = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'create-subject-submit' &&
        tapOn.optional !== true,
    );
    const confident = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > submit &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'subject-confident-card' &&
        (extendedWaitUntil.timeout ?? 0) >= 15000 &&
        extendedWaitUntil.optional !== true,
    );
    const accept = commands.findIndex(
      ({ tapOn }, index) =>
        index > confident &&
        typeof tapOn === 'object' &&
        tapOn.id === 'subject-suggestion-accept' &&
        tapOn.optional !== true,
    );
    const staleAmbiguousWait = commands.findIndex(
      ({ extendedWaitUntil }) =>
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'subject-suggestion-card',
    );

    expect(submit).toBeGreaterThan(-1);
    expect(confident).toBeGreaterThan(submit);
    expect(accept).toBeGreaterThan(confident);
    expect(staleAmbiguousWait).toBe(-1);
  });

  it.each([
    'apps/mobile/e2e/flows/regression/bug-233-chat-classifier-easter.yaml',
    'apps/mobile/e2e/flows/regression/bug-234-chat-subject-picker.yaml',
  ])(
    '[WI-1864] accepts every classifier terminal outcome in %s',
    (flowPath) => {
      const source = readFileSync(join(repoRoot, flowPath), 'utf8');
      const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
        pressKey?: string;
        extendedWaitUntil?: {
          visible?: { id?: string } | string;
          timeout?: number;
          optional?: boolean;
        };
        runFlow?: {
          when?: {
            visible?: { id?: string } | string;
          };
          commands?: Array<{
            assertVisible?: { id?: string } | string;
            extendedWaitUntil?: {
              visible?: { id?: string } | string;
              timeout?: number;
              optional?: boolean;
            };
            repeat?: {
              times?: number;
              commands?: Array<{
                swipe?: {
                  from?: { id?: string };
                  direction?: string;
                  duration?: number;
                  optional?: boolean;
                };
              }>;
            };
            scrollUntilVisible?: {
              element?: { id?: string };
              direction?: string;
              timeout?: number;
              visibilityPercentage?: number;
              centerElement?: boolean;
              optional?: boolean;
            };
          }>;
        };
      }>;
      const submit = commands.findIndex(({ pressKey }) => pressKey === 'Enter');
      const terminalOutcome = commands.findIndex(
        ({ extendedWaitUntil }, index) =>
          index > submit &&
          typeof extendedWaitUntil?.visible === 'object' &&
          typeof extendedWaitUntil.visible.id === 'string' &&
          new RegExp(extendedWaitUntil.visible.id).test('chat-input') &&
          new RegExp(extendedWaitUntil.visible.id).test(
            'subject-resolution-create-suggested',
          ) &&
          new RegExp(extendedWaitUntil.visible.id).test(
            'subject-resolution-create-new',
          ) &&
          (extendedWaitUntil.timeout ?? 0) >= 60000 &&
          extendedWaitUntil.optional !== true,
      );
      const resolutionBranch = commands.findIndex(({ runFlow }, index) => {
        const branchCommands = runFlow?.commands ?? [];
        const targetedSwipe = branchCommands.findIndex(
          ({ repeat }) =>
            (repeat?.times ?? 0) >= 4 &&
            (repeat?.commands ?? []).some(
              ({ swipe }) =>
                swipe?.from?.id === 'session-subject-resolution' &&
                swipe.direction === 'LEFT' &&
                (swipe.duration ?? 0) >= 400 &&
                swipe.optional !== true,
            ),
        );
        const escapeReceipt = branchCommands.findIndex(
          ({ extendedWaitUntil }, commandIndex) =>
            commandIndex > targetedSwipe &&
            typeof extendedWaitUntil?.visible === 'object' &&
            extendedWaitUntil.visible.id === 'subject-resolution-new' &&
            (extendedWaitUntil.timeout ?? 0) >= 5000 &&
            extendedWaitUntil.optional !== true,
        );
        return (
          index > terminalOutcome &&
          typeof runFlow?.when?.visible === 'object' &&
          runFlow.when.visible.id === 'session-subject-resolution' &&
          targetedSwipe >= 0 &&
          escapeReceipt > targetedSwipe
        );
      });
      const zeroCandidateBranch = commands.findIndex(
        ({ runFlow }, index) =>
          index > terminalOutcome &&
          typeof runFlow?.when?.visible === 'object' &&
          runFlow.when.visible.id === 'subject-resolution-create-new' &&
          (runFlow.commands ?? []).some(
            ({ assertVisible }) =>
              typeof assertVisible === 'object' &&
              assertVisible.id === 'subject-resolution-create-new',
          ),
      );
      const autoMatchBranch = commands.findIndex(
        ({ runFlow }, index) =>
          index > terminalOutcome &&
          typeof runFlow?.when?.visible === 'object' &&
          runFlow.when.visible.id === 'chat-input' &&
          (runFlow.commands ?? []).some(
            ({ assertVisible }) =>
              typeof assertVisible === 'object' &&
              assertVisible.id === 'chat-input',
          ),
      );

      expect(submit).toBeGreaterThan(-1);
      expect(terminalOutcome).toBeGreaterThan(submit);
      expect(resolutionBranch).toBeGreaterThan(terminalOutcome);
      expect(zeroCandidateBranch).toBeGreaterThan(terminalOutcome);
      expect(autoMatchBranch).toBeGreaterThan(terminalOutcome);
    },
  );

  it('[WI-1864] exercises the seeded answer-check failure before continuing the round', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/quiz/quiz-answer-check-failure.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      openLink?: string;
      tapOn?: { id?: string } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
    }>;
    const seededRound = commands.findIndex(
      ({ openLink }) =>
        openLink ===
        'mentomate:///quiz/launch?activityType=capitals&subjectId=${SUBJECT_ID}&roundId=${ROUND_ID}',
    );
    const answer = commands.findIndex(
      ({ tapOn }, index) =>
        index > seededRound &&
        typeof tapOn === 'object' &&
        tapOn.id === 'quiz-option-0',
    );
    const failure = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > answer &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'quiz-answer-check-failed' &&
        extendedWaitUntil.optional !== true,
    );
    const resolved = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > failure &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'quiz-next-question-footer' &&
        extendedWaitUntil.optional !== true,
    );

    expect(seededRound).toBeGreaterThan(-1);
    expect(answer).toBeGreaterThan(-1);
    expect(failure).toBeGreaterThan(answer);
    expect(resolved).toBeGreaterThan(failure);
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
        timeout?: number;
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
        timeout?: number;
      };
      tapOn?: { id?: string; text?: string; optional?: boolean } | string;
    }>;
    const poolVisible = commands.findIndex(
      ({ scrollUntilVisible }) =>
        scrollUntilVisible?.element?.id === 'family-pool-section' &&
        scrollUntilVisible.direction === 'DOWN' &&
        (scrollUntilVisible.timeout ?? 0) >= 30000,
    );
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
      poolVisible,
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
        poolVisible,
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
    expect(poolVisible).toBeGreaterThan(-1);
    expect(removeVisible).toBeGreaterThan(poolVisible);
    expect(
      commands
        .slice(0, poolVisible)
        .some(
          ({ extendedWaitUntil }) =>
            typeof extendedWaitUntil?.visible === 'object' &&
            extendedWaitUntil.visible.id === 'family-pool-section',
        ),
    ).toBe(false);
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
        tapOn.id === 'shelf-row-header-${SUBJECT_ID}' &&
        tapOn.optional !== true,
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

  it('[WI-1864] opens child-friendly relearn through the seeded direct-entry route', () => {
    const flow = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/retention/relearn-child-friendly.yaml',
      ),
      'utf8',
    );
    const relearnSource = readFileSync(
      join(repoRoot, 'apps/mobile/src/app/(app)/topic/relearn.tsx'),
      'utf8',
    );
    const commands = parseAllDocuments(flow).at(-1)?.toJSON() as Array<{
      runFlow?: { file?: string; env?: Record<string, string> };
      openLink?: string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
      assertVisible?:
        | { id?: string; text?: string; optional?: boolean }
        | string;
    }>;
    const seeded = commands.findIndex(
      ({ runFlow }) =>
        runFlow?.file === '../_setup/seed-and-sign-in.yaml' &&
        runFlow.env?.SEED_SCENARIO === 'failed-recall-3x',
    );
    const learner = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > seeded &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'learner-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const directEntry = commands.findIndex(
      ({ openLink }, index) =>
        index > learner &&
        openLink ===
          'mentomate:///topic/relearn?topicId=${TOPIC_ID}&subjectId=${SUBJECT_ID}',
    );
    const methodPhase = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > directEntry &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'relearn-method-phase' &&
        extendedWaitUntil.optional !== true,
    );
    const method = commands.findIndex(
      ({ assertVisible }, index) =>
        index > methodPhase &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'relearn-method-visual_diagrams' &&
        assertVisible.optional !== true,
    );

    expect([seeded, learner, directEntry, methodPhase, method]).toEqual(
      [seeded, learner, directEntry, methodPhase, method].toSorted(
        (left, right) => left - right,
      ),
    );
    expect(seeded).toBeGreaterThan(-1);
    expect(flow).not.toContain('Chemistry Topic 1');
    expect(flow).not.toContain('relearn-topics-phase');
    expect(relearnSource).toContain(
      'const directEntry = Boolean(routeTopicId && routeSubjectId);',
    );
    expect(relearnSource).toContain(
      "useState<Phase>(directEntry ? 'method' : 'topics')",
    );
  });

  it('[WI-1864] opens full relearn from the seeded stable topic result and reaches the session', () => {
    const flow = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/retention/relearn-flow.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(flow).at(-1)?.toJSON() as Array<{
      runFlow?: { file?: string; env?: Record<string, string> };
      inputText?: string;
      openLink?: string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
      assertVisible?: { id?: string; optional?: boolean } | string;
      tapOn?: { id?: string; optional?: boolean } | string;
    }>;
    const seeded = commands.findIndex(
      ({ runFlow }) =>
        runFlow?.file === '../_setup/seed-and-sign-in.yaml' &&
        runFlow.env?.SEED_SCENARIO === 'failed-recall-3x',
    );
    const learner = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > seeded &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'learner-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const library = commands.findIndex(
      ({ tapOn }, index) =>
        index > learner &&
        typeof tapOn === 'object' &&
        tapOn.id === 'tab-library' &&
        tapOn.optional !== true,
    );
    const search = commands.findIndex(
      ({ tapOn }, index) =>
        index > library &&
        typeof tapOn === 'object' &&
        tapOn.id === 'library-search-input' &&
        tapOn.optional !== true,
    );
    const query = commands.findIndex(
      ({ inputText }, index) => index > search && inputText === 'Chemistry',
    );
    const result = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > query &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'topic-row-${TOPIC_ID}' &&
        extendedWaitUntil.optional !== true,
    );
    const openTopic = commands.findIndex(
      ({ tapOn }, index) =>
        index > result &&
        typeof tapOn === 'object' &&
        tapOn.id === 'topic-row-${TOPIC_ID}' &&
        tapOn.optional !== true,
    );
    const topicDetail = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > openTopic &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'topic-detail-scroll' &&
        extendedWaitUntil.optional !== true,
    );
    const hint = commands.findIndex(
      ({ assertVisible }, index) =>
        index > topicDetail &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'topic-practiced-often-hint' &&
        assertVisible.optional !== true,
    );
    const cta = commands.findIndex(
      ({ assertVisible }, index) =>
        index > hint &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'study-cta' &&
        assertVisible.optional !== true,
    );
    const directEntry = commands.findIndex(
      ({ openLink }, index) =>
        index > cta &&
        openLink ===
          'mentomate:///topic/relearn?topicId=${TOPIC_ID}&subjectId=${SUBJECT_ID}',
    );
    const methodPhase = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > directEntry &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'relearn-method-phase' &&
        extendedWaitUntil.optional !== true,
    );
    const methodIds = [
      'relearn-method-visual_diagrams',
      'relearn-method-step_by_step',
      'relearn-method-real_world_examples',
      'relearn-method-practice_problems',
    ];
    const methodAssertions = methodIds.map((id) =>
      commands.findIndex(
        ({ assertVisible }, index) =>
          index > methodPhase &&
          typeof assertVisible === 'object' &&
          assertVisible.id === id &&
          assertVisible.optional !== true,
      ),
    );
    const methodTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > Math.max(...methodAssertions) &&
        typeof tapOn === 'object' &&
        tapOn.id === 'relearn-method-visual_diagrams' &&
        tapOn.optional !== true,
    );
    const session = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > methodTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'chat-input' &&
        extendedWaitUntil.optional !== true,
    );

    const ordered = [
      seeded,
      learner,
      library,
      search,
      query,
      result,
      openTopic,
      topicDetail,
      hint,
      cta,
      directEntry,
      methodPhase,
      ...methodAssertions,
      methodTap,
      session,
    ];
    expect(ordered).toEqual(ordered.toSorted((left, right) => left - right));
    expect(seeded).toBeGreaterThan(-1);
    expect(flow).not.toContain('shelf-row-header-${SUBJECT_ID}');
    expect(flow).not.toContain('Chemistry Topic 1');
    expect(flow).not.toContain('relearn-topics-phase');
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

  it('[WI-1864] opens topic-detail through the seeded shelf, book, and resume row', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/retention/topic-detail.yaml'),
      'utf8',
    );
    const commands = parseAllDocuments(source).at(-1)?.toJSON() as Array<{
      tapOn?: { id?: string; optional?: boolean } | string;
      assertVisible?: { id?: string; optional?: boolean } | string;
      extendedWaitUntil?: {
        visible?: { id?: string } | string;
        optional?: boolean;
      };
      scrollUntilVisible?: {
        element?: { id?: string };
        direction?: string;
        visibilityPercentage?: number;
        centerElement?: boolean;
        optional?: boolean;
      };
    }>;
    const shelf = commands.findIndex(
      ({ tapOn }) =>
        typeof tapOn === 'object' &&
        tapOn.id === 'shelf-row-header-${SUBJECT_ID}' &&
        tapOn.optional !== true,
    );
    const shelfScreen = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > shelf &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'shelf-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const bookCard = commands.findIndex(
      ({ tapOn }, index) =>
        index > shelfScreen &&
        typeof tapOn === 'object' &&
        tapOn.id === 'book-card-${BOOK_ID}' &&
        tapOn.optional !== true,
    );
    const bookScreen = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > bookCard &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'book-screen' &&
        extendedWaitUntil.optional !== true,
    );
    const topicScroll = commands.findIndex(
      ({ scrollUntilVisible }, index) =>
        index > bookScreen &&
        scrollUntilVisible?.element?.id === 'continue-now-row-${TOPIC_ID}' &&
        scrollUntilVisible.direction === 'DOWN' &&
        scrollUntilVisible.optional !== true,
    );
    const topicTap = commands.findIndex(
      ({ tapOn }, index) =>
        index > topicScroll &&
        typeof tapOn === 'object' &&
        tapOn.id === 'continue-now-row-${TOPIC_ID}' &&
        tapOn.optional !== true,
    );
    const detail = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > topicTap &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'topic-detail-scroll' &&
        extendedWaitUntil.optional !== true,
    );
    const elapsed = commands.findIndex(
      ({ assertVisible }, index) =>
        index > detail &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'retention-pill-elapsed' &&
        assertVisible.optional !== true,
    );
    const strongReviews = commands.findIndex(
      ({ assertVisible }, index) =>
        index > elapsed &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'topic-strong-reviews' &&
        assertVisible.optional !== true,
    );
    const studyCta = commands.findIndex(
      ({ assertVisible }, index) =>
        index > strongReviews &&
        typeof assertVisible === 'object' &&
        assertVisible.id === 'study-cta' &&
        assertVisible.optional !== true,
    );
    const startStudying = commands.findIndex(
      ({ assertVisible }, index) =>
        index > studyCta &&
        typeof assertVisible === 'object' &&
        assertVisible.text === 'Start studying' &&
        assertVisible.optional !== true,
    );
    const noReview = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > startStudying &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.text === 'Review this topic' &&
        assertNotVisible.optional !== true,
    );
    const noPracticeAgain = commands.findIndex(
      ({ assertNotVisible }, index) =>
        index > noReview &&
        typeof assertNotVisible === 'object' &&
        assertNotVisible.text === 'Practice again' &&
        assertNotVisible.optional !== true,
    );
    const back = commands.findIndex(
      ({ tapOn }, index) =>
        index > noPracticeAgain &&
        typeof tapOn === 'object' &&
        tapOn.id === 'topic-detail-back' &&
        tapOn.optional !== true,
    );
    const returnedBook = commands.findIndex(
      ({ extendedWaitUntil }, index) =>
        index > back &&
        typeof extendedWaitUntil?.visible === 'object' &&
        extendedWaitUntil.visible.id === 'book-screen' &&
        extendedWaitUntil.optional !== true,
    );

    const journey = [
      shelf,
      shelfScreen,
      bookCard,
      bookScreen,
      topicScroll,
      topicTap,
      detail,
      elapsed,
      strongReviews,
      studyCta,
      startStudying,
      noReview,
      noPracticeAgain,
      back,
      returnedBook,
    ];
    expect(journey).toEqual(journey.toSorted((left, right) => left - right));
    expect(shelf).toBeGreaterThan(-1);
    expect(commands[topicScroll]?.scrollUntilVisible).toMatchObject({
      visibilityPercentage: 100,
      centerElement: true,
    });
    expect(source).not.toContain('Biology Topic 1');
    expect(source).not.toContain('topic-retention-card');
    const collectTextSelectors = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(collectTextSelectors);
      if (!value || typeof value !== 'object') return [];
      return Object.entries(value as Record<string, unknown>).flatMap(
        ([key, child]) =>
          key === 'text' && typeof child === 'string'
            ? [child]
            : collectTextSelectors(child),
      );
    };
    const selectorTexts = collectTextSelectors(commands);
    for (const staleCopy of [
      'Memory strength',
      'Progress',
      'Interval',
      'Reviews',
    ]) {
      expect(selectorTexts).not.toContain(staleCopy);
    }
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
      // [WI-2240] Account row contract for a credentialed learner-only login.
      {
        flow: 'flows/v2/v2-account-non-owner-child.yaml',
        scenario: 'v2-account-non-owner-child',
        shard: 1,
      },
      // [WI-2240] Owner Account entry/return and sign-out boundary journey.
      {
        flow: 'flows/v2/v2-account-owner.yaml',
        scenario: 'parent-multi-child',
        shard: 1,
      },
      {
        flow: 'flows/v2/v2-homework-manual-entry.yaml',
        scenario: 'trial-active',
        shard: 1,
      },
      // [WI-2129] Mentor cold start exposes one composer before and after
      // selecting a starter prompt.
      {
        flow: 'flows/v2/v2-mentor-single-composer.yaml',
        scenario: 'onboarding-no-subject',
        shard: 1,
      },
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
      'homework-entry-mode-manual',
      'manual-entry-cancel',
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

  it('[WI-2236] routes the V2 shell Mentor homework action through manual entry and back to Mentor', () => {
    const flow = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/v2/v2-shell-navigation.yaml'),
      'utf8',
    );
    const commands = parseMaestroCommands(flow);

    const homeworkLaunch = commands.findIndex(
      (command) =>
        command.optional !== true &&
        command.tapOn?.id === 'mentor-bar-homework-chip',
    );
    expect(commands.slice(homeworkLaunch, homeworkLaunch + 4)).toEqual([
      { tapOn: { id: 'mentor-bar-homework-chip' } },
      {
        extendedWaitUntil: {
          visible: { id: 'homework-entry-mode-manual' },
          timeout: 15_000,
        },
      },
      { tapOn: { id: 'manual-entry-cancel' } },
      {
        extendedWaitUntil: {
          visible: { id: 'mentor-screen' },
          timeout: 15_000,
        },
      },
    ]);
    expect(
      maestroSelectorIds(commands).filter((id) =>
        ['camera-view', 'close-button'].includes(id),
      ),
    ).toEqual([]);
  });

  it('[WI-2236] registers the manual homework case in the V2 Maestro manifest', () => {
    const manifest = JSON.parse(
      readFileSync(
        join(repoRoot, 'apps/mobile/e2e/ci-maestro-manifest.json'),
        'utf8',
      ),
    ) as { v2: Array<{ flow: string; scenario: string | null }> };

    expect(manifest.v2).toContainEqual({
      flow: 'flows/v2/v2-homework-manual-entry.yaml',
      scenario: 'trial-active',
    });
  });

  it('[WI-2236] hard-gates the exact guaranteed properties of the manual homework case', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/mobile/e2e/flows/v2/v2-homework-manual-entry.yaml'),
      'utf8',
    );
    const commands = parseMaestroCommands(source);

    const exactSelector = (
      actual: ElementSelector | undefined,
      expected: ElementSelector,
    ): boolean => {
      if (!actual) return false;
      const actualDescendants = actual.containsDescendants ?? [];
      const expectedDescendants = expected.containsDescendants ?? [];
      return (
        actual.id === expected.id &&
        actual.text === expected.text &&
        actual.enabled === expected.enabled &&
        actualDescendants.length === expectedDescendants.length &&
        expectedDescendants.every((selector, index) =>
          exactSelector(actualDescendants[index], selector),
        ) &&
        Object.keys(actual).length === Object.keys(expected).length
      );
    };

    const mandatoryAssertVisible = (selector: ElementSelector): number =>
      commands.findIndex(
        (command) =>
          command.optional !== true &&
          exactSelector(command.assertVisible, selector),
      );
    const mandatoryExtendedWait = (
      selector: ElementSelector,
      timeout: number,
      startAt = 0,
    ): number =>
      commands.findIndex(
        (command, index) =>
          index >= startAt &&
          command.optional !== true &&
          command.extendedWaitUntil?.timeout === timeout &&
          exactSelector(command.extendedWaitUntil.visible, selector),
      );
    const tapIndex = (id: string, startAt = 0): number =>
      commands.findIndex(
        (command, index) =>
          index >= startAt &&
          command.optional !== true &&
          command.tapOn?.id === id,
      );
    const hasSequenceBoundSubjectReadiness = (
      items: MaestroCommand[],
    ): boolean => {
      const exactTypedProblem = items.findIndex(
        (command) =>
          command.optional !== true &&
          exactSelector(command.assertVisible, {
            id: 'result-text-input',
            text: 'Solve 3x + 7 = 22',
          }),
      );
      const subjectReadiness = items.findIndex(
        (command, index) =>
          index > exactTypedProblem &&
          command.optional !== true &&
          command.extendedWaitUntil?.timeout === 60_000 &&
          exactSelector(command.extendedWaitUntil.visible, {
            id: 'homework-subject-resolution-ready',
          }),
      );

      return exactTypedProblem >= 0 && subjectReadiness > exactTypedProblem;
    };
    const containsOptionalTrue = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(containsOptionalTrue);
      if (!value || typeof value !== 'object') return false;
      return Object.entries(value).some(
        ([key, nested]) =>
          (key === 'optional' && nested === true) ||
          containsOptionalTrue(nested),
      );
    };
    const commandSurfaceFor = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(commandSurfaceFor);
      if (!value || typeof value !== 'object') return [];
      return Object.entries(value).flatMap(([key, nested]) => [
        key,
        ...commandSurfaceFor(nested),
      ]);
    };
    for (const selector of [
      { id: 'homework-problem-text-bubble', text: 'Solve 3x + 7 = 22' },
      { id: 'homework-problem-text', text: 'Solve 3x + 7 = 22' },
      {
        id: 'message-bubble-user-1',
        containsDescendants: [{ text: 'Solve 3x + 7 = 22' }],
      },
    ]) {
      expect(mandatoryAssertVisible(selector)).toBeGreaterThan(-1);
    }

    expect(
      mandatoryExtendedWait(
        { id: 'homework-problem-progress', text: 'Problem 1 of 1' },
        30_000,
      ),
    ).toBeGreaterThan(-1);
    expect(
      mandatoryExtendedWait({ id: 'homework-first-response-complete' }, 60_000),
    ).toBeGreaterThan(-1);
    const deviceOnlySelector =
      /(camera|gallery|ocr|permission|shutter|flash|retake|message-image|homework-image)/i;
    expect(
      commandSurfaceFor(commands).filter((value) =>
        deviceOnlySelector.test(value),
      ),
    ).toEqual([]);

    const deviceOnlyCommandFixtures = [
      { cameraAction: true },
      { tapOn: { text: 'Open gallery' } },
      {
        assertVisible: {
          id: 'status',
          containsDescendants: [{ text: 'OCR result' }],
        },
      },
      { inputText: 'permission prompt' },
      { runFlow: { file: '../device/shutter-setup.yaml' } },
      { assertVisible: { text: 'Enable flash' } },
      { retakeAction: false },
      {
        tapOn: {
          id: 'container',
          containsDescendants: [{ id: 'message-image' }],
        },
      },
      { runFlow: { file: '../device/homework-image.yaml' } },
    ] as unknown as MaestroCommand[];
    for (const fixture of deviceOnlyCommandFixtures) {
      expect(
        commandSurfaceFor([fixture]).some((value) =>
          deviceOnlySelector.test(value),
        ),
      ).toBe(true);
    }

    const isAssociationWait = (command: MaestroCommand): boolean =>
      command.optional !== true &&
      command.extendedWaitUntil?.timeout === 30_000 &&
      exactSelector(command.extendedWaitUntil.visible, {
        id: 'homework-session-associated-once',
      });
    const isFinalAssociation = (command: MaestroCommand): boolean =>
      command.optional !== true &&
      exactSelector(command.assertVisible, {
        id: 'homework-session-associated-once',
      });
    const isDuplicateAbsence = (command: MaestroCommand): boolean =>
      command.optional !== true &&
      exactSelector(command.assertNotVisible, {
        id: 'homework-session-created-more-than-once',
      });
    const hasSequenceBoundSessionEvidence = (
      items: MaestroCommand[],
    ): boolean => {
      type RawCommandObject = Record<string, unknown>;
      const asCommandObject = (value: unknown): RawCommandObject | null =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? (value as RawCommandObject)
          : null;
      let hasInvalidExecutableChild = false;
      const directExecutableChildren = (
        command: MaestroCommand,
      ): MaestroCommand[] =>
        Object.values(command as unknown as RawCommandObject).flatMap(
          (operatorValue) => {
            const operator = asCommandObject(operatorValue);
            const rawChildren = operator?.['commands'];
            if (!Array.isArray(rawChildren)) return [];
            return rawChildren.flatMap((child) => {
              if (!asCommandObject(child)) {
                hasInvalidExecutableChild = true;
                return [];
              }
              return [child as MaestroCommand];
            });
          },
        );
      const collectNestedCommands = (
        commands: MaestroCommand[],
      ): MaestroCommand[] =>
        commands.flatMap((command) => {
          const nested = directExecutableChildren(command);
          return [...nested, ...collectNestedCommands(nested)];
        });
      const nestedCommands = collectNestedCommands(items);
      const criticalTapIds = new Set([
        'mentor-bar-homework-chip',
        'manual-entry-cancel',
        'confirm-button',
        'homework-help-me-solve',
      ]);
      const criticalWaitIds = new Set([
        'homework-entry-mode-manual',
        'homework-subject-resolution-ready',
        'session-screen',
      ]);
      const targetsCriticalJourney = (command: MaestroCommand): boolean =>
        (command.tapOn?.id !== undefined &&
          criticalTapIds.has(command.tapOn.id)) ||
        (command.extendedWaitUntil?.visible?.id !== undefined &&
          criticalWaitIds.has(command.extendedWaitUntil.visible.id)) ||
        command.assertVisible?.id === 'homework-help-me-solve' ||
        command.assertNotVisible?.id === 'session-subject-resolution' ||
        command.inputText === 'Solve 3x + 7 = 22';
      const rawOperator = (
        command: MaestroCommand,
        name: 'runFlow' | 'retry',
      ): unknown => (command as unknown as RawCommandObject)[name];
      const hasOpaqueExecutableReference = (
        command: MaestroCommand,
        topLevelIndex?: number,
      ): boolean =>
        (['runFlow', 'retry'] as const).some((name) => {
          const raw = rawOperator(command, name);
          if (raw === undefined) return false;
          const operator = asCommandObject(raw);
          if (!operator) return true;
          if (operator['file'] === undefined) return false;
          return !(
            name === 'runFlow' &&
            topLevelIndex === 0 &&
            operator['file'] === '../_setup/seed-and-sign-in.yaml'
          );
        });
      const canonicalSetup = asCommandObject(rawOperator(items[0]!, 'runFlow'));
      if (
        hasInvalidExecutableChild ||
        canonicalSetup?.['file'] !== '../_setup/seed-and-sign-in.yaml' ||
        items.some((command, index) =>
          hasOpaqueExecutableReference(command, index),
        ) ||
        nestedCommands.some((command) =>
          hasOpaqueExecutableReference(command),
        ) ||
        nestedCommands.some(targetsCriticalJourney)
      ) {
        return false;
      }
      const matchingIndices = (
        predicate: (command: MaestroCommand) => boolean,
      ): number[] =>
        items.flatMap((command, index) => (predicate(command) ? [index] : []));
      const tapTargets = (id: string): number[] =>
        matchingIndices((command) => command.tapOn?.id === id);
      const waitTargets = (id: string): number[] =>
        matchingIndices(
          (command) => command.extendedWaitUntil?.visible?.id === id,
        );
      const visibleTargets = (id: string): number[] =>
        matchingIndices((command) => command.assertVisible?.id === id);
      const notVisibleTargets = (id: string): number[] =>
        matchingIndices((command) => command.assertNotVisible?.id === id);
      const homeworkLaunches = tapTargets('mentor-bar-homework-chip');
      const manualMarkers = waitTargets('homework-entry-mode-manual');
      const cancels = tapTargets('manual-entry-cancel');
      const exactProblemInputs = matchingIndices(
        (command) => command.inputText === 'Solve 3x + 7 = 22',
      );
      const subjectReadinessWaits = waitTargets(
        'homework-subject-resolution-ready',
      );
      const confirms = tapTargets('confirm-button');
      const sessionArrivals = waitTargets('session-screen');
      const enabledHelpActions = visibleTargets('homework-help-me-solve');
      const subjectResolutionAbsences = notVisibleTargets(
        'session-subject-resolution',
      );
      const helpActions = tapTargets('homework-help-me-solve');
      if (
        homeworkLaunches.length !== 2 ||
        manualMarkers.length !== 2 ||
        cancels.length !== 1 ||
        exactProblemInputs.length !== 1 ||
        subjectReadinessWaits.length !== 1 ||
        confirms.length !== 1 ||
        sessionArrivals.length !== 1 ||
        enabledHelpActions.length !== 1 ||
        subjectResolutionAbsences.length !== 1 ||
        helpActions.length !== 1
      ) {
        return false;
      }
      const exactTapAt = (index: number, id: string): boolean => {
        const command = items[index]!;
        return (
          command.optional !== true && exactSelector(command.tapOn, { id })
        );
      };
      const hardWaitAt = (
        index: number,
        id: string,
        timeout: number,
      ): boolean => {
        const command = items[index]!;
        return (
          command.optional !== true &&
          command.extendedWaitUntil?.timeout === timeout &&
          exactSelector(command.extendedWaitUntil.visible, { id })
        );
      };
      if (
        !homeworkLaunches.every((index) =>
          exactTapAt(index, 'mentor-bar-homework-chip'),
        ) ||
        !manualMarkers.every((index) =>
          hardWaitAt(index, 'homework-entry-mode-manual', 15_000),
        ) ||
        !cancels.every((index) => exactTapAt(index, 'manual-entry-cancel')) ||
        !exactProblemInputs.every((index) => items[index]!.optional !== true) ||
        !subjectReadinessWaits.every((index) =>
          hardWaitAt(index, 'homework-subject-resolution-ready', 60_000),
        ) ||
        !confirms.every((index) => exactTapAt(index, 'confirm-button')) ||
        !sessionArrivals.every((index) =>
          hardWaitAt(index, 'session-screen', 30_000),
        ) ||
        !enabledHelpActions.every((index) => {
          const command = items[index]!;
          return (
            command.optional !== true &&
            exactSelector(command.assertVisible, {
              id: 'homework-help-me-solve',
              enabled: true,
            })
          );
        }) ||
        !subjectResolutionAbsences.every((index) => {
          const command = items[index]!;
          return (
            command.optional !== true &&
            exactSelector(command.assertNotVisible, {
              id: 'session-subject-resolution',
            })
          );
        }) ||
        !helpActions.every((index) =>
          exactTapAt(index, 'homework-help-me-solve'),
        )
      ) {
        return false;
      }
      const [firstHomeworkLaunch, secondHomeworkLaunch] = homeworkLaunches;
      const [firstManualMarker, secondManualMarker] = manualMarkers;
      const cancel = cancels[0]!;
      const exactProblemInput = exactProblemInputs[0]!;
      const subjectReadiness = subjectReadinessWaits[0]!;
      const confirm = confirms[0]!;
      const sessionArrival = sessionArrivals[0]!;
      const enabledHelpAction = enabledHelpActions[0]!;
      const subjectResolutionAbsent = subjectResolutionAbsences[0]!;
      const helpAction = helpActions[0]!;
      const associationWait = items.findIndex(
        (command, index) => index > helpAction && isAssociationWait(command),
      );
      const completedResponse = items.findIndex(
        (command, index) =>
          index > associationWait &&
          command.optional !== true &&
          command.extendedWaitUntil?.timeout === 60_000 &&
          exactSelector(command.extendedWaitUntil.visible, {
            id: 'homework-first-response-complete',
          }),
      );
      const finalAssociation = items.findIndex(
        (command, index) =>
          index > completedResponse && isFinalAssociation(command),
      );
      const duplicateAbsence = items.findIndex(
        (command, index) =>
          index > completedResponse && isDuplicateAbsence(command),
      );
      return (
        firstHomeworkLaunch >= 0 &&
        firstManualMarker > firstHomeworkLaunch &&
        cancel > firstManualMarker &&
        secondHomeworkLaunch > cancel &&
        secondManualMarker > secondHomeworkLaunch &&
        exactProblemInput > secondManualMarker &&
        subjectReadiness > exactProblemInput &&
        confirm > subjectReadiness &&
        sessionArrival > confirm &&
        enabledHelpAction > sessionArrival &&
        subjectResolutionAbsent > enabledHelpAction &&
        helpAction === subjectResolutionAbsent + 1 &&
        associationWait > helpAction &&
        completedResponse > associationWait &&
        finalAssociation > completedResponse &&
        duplicateAbsence > completedResponse
      );
    };

    const firstHomeworkLaunch = tapIndex('mentor-bar-homework-chip');
    const firstManualMarker = mandatoryExtendedWait(
      { id: 'homework-entry-mode-manual' },
      15_000,
      firstHomeworkLaunch + 1,
    );
    const cancel = tapIndex('manual-entry-cancel', firstManualMarker + 1);
    const mentorAfterCancel = mandatoryExtendedWait(
      { id: 'mentor-screen' },
      15_000,
      cancel + 1,
    );
    const usableMentorInput = commands.findIndex(
      (command, index) =>
        index > mentorAfterCancel &&
        command.optional !== true &&
        exactSelector(command.assertVisible, {
          id: 'mentor-bar-input',
          enabled: true,
        }),
    );
    const secondHomeworkLaunch = tapIndex(
      'mentor-bar-homework-chip',
      usableMentorInput + 1,
    );
    const secondManualMarker = mandatoryExtendedWait(
      { id: 'homework-entry-mode-manual' },
      15_000,
      secondHomeworkLaunch + 1,
    );
    const emptyManualEntry = mandatoryExtendedWait(
      { id: 'homework-manual-entry-empty' },
      15_000,
      secondManualMarker + 1,
    );
    const exactProblemInput = commands.findIndex(
      (command, index) =>
        index > emptyManualEntry &&
        command.optional !== true &&
        command.inputText === 'Solve 3x + 7 = 22',
    );
    const exactTypedProblem = commands.findIndex(
      (command, index) =>
        index > exactProblemInput &&
        command.optional !== true &&
        exactSelector(command.assertVisible, {
          id: 'result-text-input',
          text: 'Solve 3x + 7 = 22',
        }),
    );
    expect(firstHomeworkLaunch).toBeGreaterThan(-1);
    expect(firstManualMarker).toBeGreaterThan(firstHomeworkLaunch);
    expect(cancel).toBeGreaterThan(firstManualMarker);
    expect(mentorAfterCancel).toBeGreaterThan(cancel);
    expect(usableMentorInput).toBeGreaterThan(mentorAfterCancel);
    expect(secondHomeworkLaunch).toBeGreaterThan(usableMentorInput);
    expect(secondManualMarker).toBeGreaterThan(secondHomeworkLaunch);
    expect(emptyManualEntry).toBeGreaterThan(secondManualMarker);
    expect(exactProblemInput).toBeGreaterThan(emptyManualEntry);
    expect(exactTypedProblem).toBeGreaterThan(exactProblemInput);
    expect(tapIndex('manual-entry-button')).toBe(-1);

    const resolvedSubject = mandatoryExtendedWait(
      { id: 'homework-subject-resolution-ready' },
      60_000,
      exactTypedProblem + 1,
    );
    const enabledConfirm = commands.findIndex(
      (command, index) =>
        index > resolvedSubject &&
        command.optional !== true &&
        exactSelector(command.assertVisible, {
          id: 'confirm-button',
          enabled: true,
        }),
    );
    const confirmTap = tapIndex('confirm-button', enabledConfirm + 1);
    expect(resolvedSubject).toBeGreaterThan(exactTypedProblem);
    expect(enabledConfirm).toBeGreaterThan(resolvedSubject);
    expect(confirmTap).toBeGreaterThan(enabledConfirm);

    expect(hasSequenceBoundSubjectReadiness(commands)).toBe(true);
    const subjectReadinessCommands = commands.filter(
      (command) =>
        command.optional !== true &&
        command.extendedWaitUntil?.timeout === 60_000 &&
        exactSelector(command.extendedWaitUntil.visible, {
          id: 'homework-subject-resolution-ready',
        }),
    );
    const commandsWithoutSubjectReadiness = commands.filter(
      (command) => !subjectReadinessCommands.includes(command),
    );
    const readinessCancelPhaseIndex = commandsWithoutSubjectReadiness.findIndex(
      (command) => command.tapOn?.id === 'manual-entry-cancel',
    );
    const readinessMovedIntoCancelPhase = [
      ...commandsWithoutSubjectReadiness.slice(
        0,
        readinessCancelPhaseIndex + 1,
      ),
      ...subjectReadinessCommands,
      ...commandsWithoutSubjectReadiness.slice(readinessCancelPhaseIndex + 1),
    ];
    expect(
      hasSequenceBoundSubjectReadiness(readinessMovedIntoCancelPhase),
    ).toBe(false);

    expect(hasSequenceBoundSessionEvidence(commands)).toBe(true);
    const duplicateEarlyProblemInput = [
      ...commands.slice(0, secondManualMarker + 1),
      { inputText: 'Solve 3x + 7 = 22' },
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(duplicateEarlyProblemInput)).toBe(
      false,
    );
    const duplicateEarlySubjectReadiness = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        extendedWaitUntil: {
          visible: { id: 'homework-subject-resolution-ready' },
          timeout: 60_000,
        },
      },
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(
      hasSequenceBoundSessionEvidence(duplicateEarlySubjectReadiness),
    ).toBe(false);
    const nearShapeThirdJourney = [
      {
        tapOn: {
          id: 'manual-entry-cancel',
          retryTapIfNoChange: true,
        },
      },
      {
        tapOn: {
          id: 'mentor-bar-homework-chip',
          retryTapIfNoChange: true,
        },
      },
      {
        extendedWaitUntil: {
          visible: {
            id: 'homework-entry-mode-manual',
            enabled: true,
          },
          timeout: 15_000,
        },
      },
    ] as unknown as MaestroCommand[];
    const nearShapeThirdJourneyAfterSecondMarker = [
      ...commands.slice(0, secondManualMarker + 1),
      ...nearShapeThirdJourney,
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(
      hasSequenceBoundSessionEvidence(nearShapeThirdJourneyAfterSecondMarker),
    ).toBe(false);
    const nestedThirdJourneyCommands: MaestroCommand[] = [
      { tapOn: { id: 'manual-entry-cancel' } },
      {
        extendedWaitUntil: {
          visible: { id: 'mentor-screen' },
          timeout: 15_000,
        },
      },
      { tapOn: { id: 'mentor-bar-homework-chip' } },
      {
        extendedWaitUntil: {
          visible: { id: 'homework-entry-mode-manual' },
          timeout: 15_000,
        },
      },
    ];
    const nestedThirdJourneyAfterSecondMarker = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        runFlow: {
          when: { visible: { id: 'homework-entry-mode-manual' } },
          commands: nestedThirdJourneyCommands,
        },
      },
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(
      hasSequenceBoundSessionEvidence(nestedThirdJourneyAfterSecondMarker),
    ).toBe(false);
    const lateOpaqueSubflow = [
      ...commands.slice(0, secondManualMarker + 1),
      { runFlow: { file: '../_setup/opaque-journey.yaml' } },
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(lateOpaqueSubflow)).toBe(false);
    const lateScalarSubflow = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        runFlow: '../_setup/opaque-journey.yaml',
      } as unknown as MaestroCommand,
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(lateScalarSubflow)).toBe(false);
    const deepScalarSubflow = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        runFlow: {
          commands: [
            {
              runFlow: {
                commands: [
                  {
                    runFlow: '../_setup/opaque-journey.yaml',
                  } as unknown as MaestroCommand,
                ],
              },
            },
          ],
        },
      },
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(deepScalarSubflow)).toBe(false);
    const repeatThirdJourney = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        repeat: { times: 1, commands: nestedThirdJourneyCommands },
      } as unknown as MaestroCommand,
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(repeatThirdJourney)).toBe(false);
    const retryThirdJourney = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        retry: { maxRetries: 1, commands: nestedThirdJourneyCommands },
      } as unknown as MaestroCommand,
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(retryThirdJourney)).toBe(false);
    const opaqueRetryFile = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        retry: { file: '../_setup/opaque-journey.yaml' },
      } as unknown as MaestroCommand,
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(opaqueRetryFile)).toBe(false);
    const deepMixedThirdJourney = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        runFlow: {
          commands: [
            {
              repeat: {
                times: 1,
                commands: [
                  {
                    retry: {
                      maxRetries: 1,
                      commands: nestedThirdJourneyCommands,
                    },
                  } as unknown as MaestroCommand,
                ],
              },
            } as unknown as MaestroCommand,
          ],
        },
      },
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(deepMixedThirdJourney)).toBe(false);
    const harmlessNestedCommand = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        runFlow: {
          when: { visible: { id: 'mentor-screen' } },
          commands: [{ assertVisible: { id: 'mentor-screen' } }],
        },
      },
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(harmlessNestedCommand)).toBe(true);
    const harmlessRepeatAndRetry = [
      ...commands.slice(0, secondManualMarker + 1),
      {
        repeat: {
          times: 1,
          commands: [{ assertVisible: { id: 'mentor-screen' } }],
        },
      } as unknown as MaestroCommand,
      {
        retry: {
          maxRetries: 1,
          commands: [{ assertVisible: { id: 'mentor-screen' } }],
        },
      } as unknown as MaestroCommand,
      ...commands.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(harmlessRepeatAndRetry)).toBe(true);
    const subjectResolutionAbsenceCommands = commands.filter(
      (command) =>
        command.optional !== true &&
        exactSelector(command.assertNotVisible, {
          id: 'session-subject-resolution',
        }),
    );
    expect(subjectResolutionAbsenceCommands).toHaveLength(1);
    const commandsWithoutSubjectResolutionAbsence = commands.filter(
      (command) => !subjectResolutionAbsenceCommands.includes(command),
    );
    const subjectAbsenceInCancelPhase = [
      ...commandsWithoutSubjectResolutionAbsence.slice(0, cancel + 1),
      ...subjectResolutionAbsenceCommands,
      ...commandsWithoutSubjectResolutionAbsence.slice(cancel + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(subjectAbsenceInCancelPhase)).toBe(
      false,
    );
    const subjectResolutionAbsenceIndex = commands.indexOf(
      subjectResolutionAbsenceCommands[0]!,
    );
    const prematureSubjectPair = commands.slice(
      subjectResolutionAbsenceIndex,
      subjectResolutionAbsenceIndex + 2,
    );
    const commandsWithoutSubjectPair = commands.filter(
      (_command, index) =>
        index < subjectResolutionAbsenceIndex ||
        index >= subjectResolutionAbsenceIndex + 2,
    );
    const subjectPairBeforeProblemEntry = [
      ...commandsWithoutSubjectPair.slice(0, secondManualMarker + 1),
      ...prematureSubjectPair,
      ...commandsWithoutSubjectPair.slice(secondManualMarker + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(subjectPairBeforeProblemEntry)).toBe(
      false,
    );
    const sessionEvidenceCommands = commands.filter(
      (command) =>
        isAssociationWait(command) ||
        isFinalAssociation(command) ||
        isDuplicateAbsence(command),
    );
    const commandsWithoutSessionEvidence = commands.filter(
      (command) => !sessionEvidenceCommands.includes(command),
    );
    const cancelPhaseIndex = commandsWithoutSessionEvidence.findIndex(
      (command) => command.tapOn?.id === 'manual-entry-cancel',
    );
    const evidenceMovedIntoCancelPhase = [
      ...commandsWithoutSessionEvidence.slice(0, cancelPhaseIndex + 1),
      ...sessionEvidenceCommands,
      ...commandsWithoutSessionEvidence.slice(cancelPhaseIndex + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(evidenceMovedIntoCancelPhase)).toBe(
      false,
    );
    const thirdJourneyOwnedCommands = commands.filter(
      (command, index) =>
        (index >= subjectResolutionAbsenceIndex &&
          index < subjectResolutionAbsenceIndex + 2) ||
        isAssociationWait(command) ||
        (command.optional !== true &&
          command.extendedWaitUntil?.timeout === 60_000 &&
          exactSelector(command.extendedWaitUntil.visible, {
            id: 'homework-first-response-complete',
          })) ||
        isFinalAssociation(command) ||
        isDuplicateAbsence(command),
    );
    const commandsWithoutThirdJourneyEvidence = commands.filter(
      (command) => !thirdJourneyOwnedCommands.includes(command),
    );
    const secondHelpVisibility = commandsWithoutThirdJourneyEvidence.findIndex(
      (command) =>
        command.optional !== true &&
        exactSelector(command.assertVisible, {
          id: 'homework-help-me-solve',
          enabled: true,
        }),
    );
    const evidenceOwnedByThirdJourney = [
      ...commandsWithoutThirdJourneyEvidence.slice(0, secondHelpVisibility + 1),
      { tapOn: { id: 'manual-entry-cancel' } },
      { tapOn: { id: 'mentor-bar-homework-chip' } },
      {
        extendedWaitUntil: {
          visible: { id: 'homework-entry-mode-manual' },
          timeout: 15_000,
        },
      },
      ...thirdJourneyOwnedCommands,
      ...commandsWithoutThirdJourneyEvidence.slice(secondHelpVisibility + 1),
    ];
    expect(hasSequenceBoundSessionEvidence(evidenceOwnedByThirdJourney)).toBe(
      false,
    );

    expect(
      commands.findIndex(
        (command) =>
          command.optional !== true &&
          exactSelector(command.assertNotVisible, {
            id: 'session-reconnect-.*',
          }),
      ),
    ).toBeGreaterThan(-1);

    const back = tapIndex('chat-shell-back');
    expect(back).toBeGreaterThan(-1);
    const mentorReturn = mandatoryExtendedWait(
      { id: 'mentor-screen' },
      30_000,
      back + 1,
    );
    expect(mentorReturn).toBeGreaterThan(back);
    expect(
      commands.findIndex(
        (command, index) =>
          index > mentorReturn &&
          command.optional !== true &&
          exactSelector(command.assertVisible, {
            id: 'mentor-bar-input',
            enabled: true,
          }),
      ),
    ).toBeGreaterThan(mentorReturn);
    expect(containsOptionalTrue(commands)).toBe(false);
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
    type Command = LooseMaestroObject;
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
    type Command = LooseMaestroObject;
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
        },
      },
    ];
    const branch = (triggerId: string, commands: Command[]): Command => ({
      runFlow: {
        when: { visible: { id: triggerId } },
        commands,
      },
    });
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
    const expectedCorrectiveTaps = [
      'subject-suggestion-accept|',
      'subject-suggestion-accept|',
      'subject-use-my-words|',
    ].sort();
    const correctiveTapSignatures = (commands: unknown[]): string[] =>
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
        correctiveTapSignatures(commands),
        expectedCorrectiveTaps,
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
    for (const [branchIndex, ownerId, actionId] of [
      [3, 'subject-confident-card', 'subject-suggestion-accept'],
      [4, 'subject-single-suggestion-card', 'subject-suggestion-accept'],
      [5, 'subject-no-match-card', 'subject-use-my-words'],
    ] as const) {
      expect(
        satisfiesOutcomeContract(
          replaceAt(
            outcomeSequence,
            branchIndex,
            branch(ownerId, [
              {
                assertVisible: {
                  id: ownerId,
                  containsDescendants: [{ id: actionId }],
                },
              },
              { tapOn: { id: actionId, childOf: { id: ownerId } } },
            ]),
          ),
        ),
      ).toBe(false);
    }
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

  it('[WI-2618] keeps Subjects active while switching directly between supportee and Me scopes', () => {
    const selfLearningFlow = readFileSync(
      join(
        repoRoot,
        'apps/mobile/e2e/flows/v2/v2-supporter-self-learning-doorway.yaml',
      ),
      'utf8',
    );
    const commands = parseAllDocuments(selfLearningFlow)[1]?.toJS() as unknown;

    expect(Array.isArray(commands)).toBe(true);
    if (!Array.isArray(commands)) {
      throw new Error(
        'supporter self-learning Maestro commands must be a YAML list',
      );
    }

    const personScopeSwitch = {
      tapOn: { id: 'scope-chip-option-person-${SUPPORTEE_PERSON_ID}' },
    };
    const meScopeSwitch = { tapOn: { id: 'scope-chip-option-me' } };
    const personScopeSubjects = {
      extendedWaitUntil: {
        visible: { id: 'person-scope-structural-subjects' },
        timeout: 15000,
      },
    };
    const personScopeSubjectsEmpty = {
      extendedWaitUntil: {
        visible: { id: 'person-scope-subjects-empty-state' },
        timeout: 15000,
      },
    };
    const meScopeSubjects = {
      extendedWaitUntil: {
        visible: { id: 'subjects-screen' },
        timeout: 15000,
      },
    };
    const ownSubjectAbsentInPersonScope = {
      assertNotVisible: {
        id: 'person-scope-subject-${OWN_SUBJECT_ID}',
      },
    };
    const ownSubjectTextAbsentInPersonScope = {
      assertNotVisible: { text: 'Supporter Own Subject' },
    };
    const ownSubjectVisibleInMeScope = {
      assertVisible: {
        id: 'subjects-browse-row-${OWN_SUBJECT_ID}',
      },
    };
    const personScopeMentorWait = {
      extendedWaitUntil: {
        visible: { id: 'person-scope-mentor-tab' },
        timeout: 15000,
      },
    };
    const personScopeMentorTap = {
      tapOn: { id: 'person-scope-mentor-tab' },
    };
    const subjectsTabTap = {
      tapOn: { id: 'tab-subjects', retryTapIfNoChange: true },
    };
    const seedAndSignInSetup = {
      runFlow: {
        file: '../_setup/seed-and-sign-in.yaml',
        env: {
          SEED_SCENARIO: 'v2-supporter-self-learning-active',
          API_URL: '${API_URL}',
        },
      },
    };
    const wrongSeedSetup = {
      runFlow: {
        file: '../_setup/seed-and-sign-in.yaml',
        env: {
          SEED_SCENARIO: 'v2-supporter-cold-start',
          API_URL: '${API_URL}',
        },
      },
    };
    const expectedSwitchSequence = [
      personScopeSwitch,
      personScopeSubjects,
      personScopeSubjectsEmpty,
      ownSubjectAbsentInPersonScope,
      ownSubjectTextAbsentInPersonScope,
      meScopeSwitch,
      meScopeSubjects,
      ownSubjectVisibleInMeScope,
    ];
    const satisfiesSubjectsScopeContract = (values: unknown[]): boolean => {
      const personSwitchIndex = values.findIndex((command) =>
        isDeepStrictEqual(command, personScopeSwitch),
      );
      return (
        isDeepStrictEqual(values[0], seedAndSignInSetup) &&
        personSwitchIndex >= 0 &&
        personSwitchIndex + expectedSwitchSequence.length === values.length &&
        isDeepStrictEqual(
          values.slice(
            personSwitchIndex,
            personSwitchIndex + expectedSwitchSequence.length,
          ),
          expectedSwitchSequence,
        )
      );
    };
    const remove = (values: unknown[], target: unknown): unknown[] => {
      const index = values.findIndex((command) =>
        isDeepStrictEqual(command, target),
      );
      return removeAt(values, index);
    };
    const removeAt = (values: unknown[], index: number): unknown[] =>
      values.filter((_, candidateIndex) => candidateIndex !== index);
    const swapAt = (
      values: unknown[],
      leftIndex: number,
      rightIndex: number,
    ): unknown[] => {
      const copy = [...values];
      [copy[leftIndex], copy[rightIndex]] = [copy[rightIndex], copy[leftIndex]];
      return copy;
    };
    const optionalAt = (values: unknown[], index: number): unknown[] =>
      values.map((command, commandIndex) => {
        if (
          commandIndex !== index ||
          typeof command !== 'object' ||
          command === null
        ) {
          return command;
        }
        if ('assertNotVisible' in command) {
          return {
            assertNotVisible: {
              ...(command as { assertNotVisible: Record<string, unknown> })
                .assertNotVisible,
              optional: true,
            },
          };
        }
        if ('assertVisible' in command) {
          return {
            assertVisible: {
              ...(command as { assertVisible: Record<string, unknown> })
                .assertVisible,
              optional: true,
            },
          };
        }
        return command;
      });

    expect(satisfiesSubjectsScopeContract(commands)).toBe(true);

    const personSwitchIndex = commands.findIndex((command) =>
      isDeepStrictEqual(command, personScopeSwitch),
    );
    const meSwitchIndex = commands.findIndex(
      (command, index) =>
        index > personSwitchIndex && isDeepStrictEqual(command, meScopeSwitch),
    );
    const personSubjectsEmptyIndex = commands.findIndex(
      (command, index) =>
        index > personSwitchIndex &&
        index < meSwitchIndex &&
        isDeepStrictEqual(command, personScopeSubjectsEmpty),
    );
    const ownSubjectTextAbsentIndex = commands.findIndex(
      (command, index) =>
        index > personSwitchIndex &&
        index < meSwitchIndex &&
        isDeepStrictEqual(command, ownSubjectTextAbsentInPersonScope),
    );
    const ownSubjectVisibleInMeScopeIndex = commands.findIndex(
      (command, index) =>
        index > meSwitchIndex &&
        isDeepStrictEqual(command, ownSubjectVisibleInMeScope),
    );
    const ownSubjectAbsentInPersonScopeIndex = commands.findIndex(
      (command, index) =>
        index > personSwitchIndex &&
        index < meSwitchIndex &&
        isDeepStrictEqual(command, ownSubjectAbsentInPersonScope),
    );
    for (const mutation of [
      [
        ...commands.slice(0, personSwitchIndex + 1),
        personScopeMentorWait,
        ...commands.slice(personSwitchIndex + 1),
      ],
      [
        ...commands.slice(0, personSwitchIndex + 1),
        personScopeMentorTap,
        ...commands.slice(personSwitchIndex + 1),
      ],
      [
        ...commands.slice(0, personSwitchIndex + 1),
        subjectsTabTap,
        ...commands.slice(personSwitchIndex + 1),
      ],
      [
        ...commands.slice(0, meSwitchIndex + 1),
        subjectsTabTap,
        ...commands.slice(meSwitchIndex + 1),
      ],
      commands.map((command, index) =>
        index === 0 ? wrongSeedSetup : command,
      ),
      [...commands, subjectsTabTap],
      [...commands, personScopeMentorWait],
      remove(commands, personScopeSwitch),
      swapAt(commands, personSwitchIndex, meSwitchIndex),
      removeAt(commands, personSubjectsEmptyIndex),
      remove(commands, ownSubjectAbsentInPersonScope),
      removeAt(commands, ownSubjectTextAbsentIndex),
      optionalAt(commands, ownSubjectAbsentInPersonScopeIndex),
      optionalAt(commands, ownSubjectTextAbsentIndex),
      optionalAt(commands, ownSubjectVisibleInMeScopeIndex),
    ]) {
      expect(satisfiesSubjectsScopeContract(mutation)).toBe(false);
    }
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
  maestroArgvMarker: string;
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
  const maestroArgvMarker = join(root, 'maestro-argv');
  const bashEnv = join(root, 'bash-env');

  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    maestro,
    [
      '#!/usr/bin/env bash',
      'printf "ran\\n" >> "$FAKE_MAESTRO_MARKER"',
      'printf "%q " "$@" >> "$FAKE_MAESTRO_ARGV_MARKER"',
      'printf "\\n" >> "$FAKE_MAESTRO_ARGV_MARKER"',
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
      '  */v1/__test/seed*\\"scenario\\":\\"parent-multi-child\\"*) printf \'{"email":"test@example.com","password":"pw","accountId":"account","profileId":"profile","ids":{"ownerSubjectId":"owner-subject"}}\' ;;',
      '  */v1/__test/seed*\\"scenario\\":\\"v2-account-non-owner-child\\"*) printf \'{"email":"test@example.com","password":"pw","accountId":"account","profileId":"profile","ids":{"subjectId":"non-owner-subject"}}\' ;;',
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
    maestroArgvMarker,
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
        FAKE_MAESTRO_ARGV_MARKER: harness.maestroArgvMarker,
        MAESTRO_CI_SUITE: 'pr',
        MAESTRO_CI_SHARD: '1',
        MAESTRO_OUTPUT_DIR: harness.outputDir,
        ...envOverrides,
      },
    },
  );
}
