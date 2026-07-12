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

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

const SMOKE_RESULT_EXPR = /needs\s*\.\s*run-smoke\s*\.\s*result/;

/**
 * True if a single gate step branches its exit on the run-smoke result — i.e.
 * it either references `needs.run-smoke.result` inline in the script, or it
 * surfaces that result via an env var that then appears inside an `if [[ … ]]`
 * test condition (the shape a hard gate uses to drive a failing exit). Used by
 * the F-157 gate guard, which scans EVERY gate run: step with this predicate.
 */
function gateStepBranchesOnSmokeResult(step: Record<string, unknown>): boolean {
  const script = typeof step.run === 'string' ? step.run : '';
  if (SMOKE_RESULT_EXPR.test(script)) return true;

  const stepEnv = (step.env ?? {}) as Record<string, unknown>;
  const smokeEnvVars = Object.entries(stepEnv)
    .filter(([, v]) => SMOKE_RESULT_EXPR.test(String(v)))
    .map(([k]) => k);
  for (const v of smokeEnvVars) {
    const conditionRef = new RegExp(String.raw`if\s*\[\[[^\n]*\$\{?${v}\b`);
    if (conditionRef.test(script)) return true;
  }
  return false;
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

  it('the required gate exits 0 and no gate step branches its exit on the run-smoke result', () => {
    const [[, gate]] = jobsWithName(REQUIRED_CHECK_NAME);
    const runSteps = (gate.steps ?? []).filter(
      (s) => typeof s.run === 'string',
    );
    expect(runSteps.length).toBeGreaterThan(0);

    // Honest pass-through: at least one gate step reaches exit 0 ...
    const combinedScript = runSteps.map((s) => String(s.run)).join('\n');
    expect(combinedScript).toMatch(/exit 0/);

    // ... and NO gate step branches its exit code on run-smoke's outcome. That
    // is the precise F-157 invariant: the required check is advisory-only over
    // the smoke (secret-backed smoke is un-runnable in CI until DOPPLER_TOKEN_STG
    // is provisioned, so gating on it would make the required check permanently
    // red on trusted web PRs). We scan EVERY run: step (not just the first) and
    // its env mapping, so a regression that splits the gate into a harmless
    // logging step followed by a second step that branches on the smoke result
    // is still caught.
    const branching = runSteps.filter(gateStepBranchesOnSmokeResult);
    expect(branching).toEqual([]);
  });

  it('the multi-step gate scan catches a SECOND step that branches on the smoke result (not just the first)', () => {
    // Synthetic proof of the P2-fixed coverage: a regression that hides the
    // hard gate in a later step — a benign `exit 0` logging step first, then a
    // step that branches to `exit 1` on the smoke result — must be detected.
    // Exercises the exact predicate the real-workflow guard above uses.
    const gateSteps: Array<Record<string, unknown>> = [
      { run: 'echo "advisory smoke ran"; exit 0' },
      {
        env: { SMOKE_RESULT: '${{ needs.run-smoke.result }}' },
        run: 'if [[ "$SMOKE_RESULT" == "failure" ]]; then exit 1; fi',
      },
    ];
    const runSteps = gateSteps.filter((s) => typeof s.run === 'string');

    // First step alone looks innocent ...
    expect(gateStepBranchesOnSmokeResult(runSteps[0]!)).toBe(false);
    // ... but the second step branches on the smoke result and is caught.
    expect(gateStepBranchesOnSmokeResult(runSteps[1]!)).toBe(true);
    // The whole-gate scan (every step) therefore flags the regression.
    expect(runSteps.some(gateStepBranchesOnSmokeResult)).toBe(true);

    // Also catch the inline (no-env) form in a later step.
    const inlineLater: Array<Record<string, unknown>> = [
      { run: 'echo "log"; exit 0' },
      {
        run: 'if [[ "${{ needs.run-smoke.result }}" != "success" ]]; then exit 1; fi',
      },
    ];
    expect(inlineLater.some(gateStepBranchesOnSmokeResult)).toBe(true);
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
