import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

const REPO_ROOT = join(__dirname, '..');

interface WorkflowStep {
  name?: string;
  run?: string;
}

interface WorkflowJob {
  env?: Record<string, string>;
  steps?: WorkflowStep[];
}

interface WorkflowFile {
  jobs: Record<string, WorkflowJob>;
}

interface EasBuildProfile {
  environment?: string;
  env?: Record<string, string>;
}

interface EasJson {
  build: Record<string, EasBuildProfile>;
}

const workflow = parse(
  readFileSync(
    join(REPO_ROOT, '.github', 'workflows', 'mobile-ci.yml'),
    'utf8',
  ),
) as WorkflowFile;

const easJson = JSON.parse(
  readFileSync(join(REPO_ROOT, 'apps', 'mobile', 'eas.json'), 'utf8'),
) as EasJson;

// Update this list when adding new native build jobs to mobile-ci.yml — a new
// job not listed here would silently skip public-env guard coverage.
const NATIVE_BUILD_JOBS = ['build-preview', 'build-manual'] as const;

// Client-side keys that must be present in the real EAS Environment Variable
// store (not a GitHub Actions secret — see WI-2301) before a native build
// ships, and must never appear in the committed eas.json.
const REQUIRED_EAS_ENV_KEYS = [
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_REVENUECAT_API_KEY_IOS',
  'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID',
] as const;

const EAS_PROFILE_ENVIRONMENTS = {
  development: 'development',
  preview: 'preview',
  production: 'production',
};

function getJob(name: (typeof NATIVE_BUILD_JOBS)[number]): WorkflowJob {
  const job = workflow.jobs[name];
  if (!job) {
    throw new Error(`Missing Mobile CI job: ${name}`);
  }
  return job;
}

// Pulls the literal "Verify EAS environment variables" step's `run:` bash
// straight out of the parsed workflow — executing the workflow's own text
// (rather than a hand-copied re-implementation) so this test cannot drift
// from what CI actually runs.
function getVerifyStepRun(jobName: (typeof NATIVE_BUILD_JOBS)[number]): string {
  const steps = getJob(jobName).steps ?? [];
  const verifyStep = steps.find((step) =>
    step.name?.startsWith('Verify EAS environment variables'),
  );
  if (!verifyStep?.run) {
    throw new Error(`Missing verify-EAS-env step run text in job: ${jobName}`);
  }
  return verifyStep.run;
}

// Runs a job's verify-EAS-env bash against a fake `eas` binary that prints a
// fixed `eas env:list` fixture, so the test exercises the real predicate
// (grep pattern, missing-key accumulation, exit code) instead of a
// reimplementation of it.
function runVerifyPredicate(
  jobName: (typeof NATIVE_BUILD_JOBS)[number],
  fixture: string,
): { status: number | null; stderr: string } {
  const binDir = mkdtempSync(join(tmpdir(), 'mobile-ci-eas-mock-'));
  try {
    const fixturePath = join(binDir, 'fixture.txt');
    writeFileSync(fixturePath, fixture);

    const easStubPath = join(binDir, 'eas');
    writeFileSync(
      easStubPath,
      [
        '#!/usr/bin/env bash',
        'if [ "$1" = "env:list" ]; then',
        '  cat "$MOCK_EAS_ENV_LIST_FIXTURE"',
        '  exit 0',
        'fi',
        'echo "unexpected eas invocation: $*" >&2',
        'exit 1',
        '',
      ].join('\n'),
    );
    chmodSync(easStubPath, 0o755);

    const result = spawnSync('bash', ['-c', getVerifyStepRun(jobName)], {
      cwd: join(REPO_ROOT, 'apps', 'mobile'),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        MOCK_EAS_ENV_LIST_FIXTURE: fixturePath,
        EAS_PROFILE: 'preview',
      },
    });
    return { status: result.status, stderr: result.stderr };
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }
}

const PRESENT_NON_EMPTY_FIXTURE = [
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_abc',
  'EXPO_PUBLIC_SENTRY_DSN=https://sentry.example/1',
  'EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=rc_ios_abc',
  'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=rc_android_abc',
].join('\n');

// WI-2301 rework: the AC-1 defect — a configured-but-EMPTY EAS env var
// renders as "KEY=" (nothing after "="), and the old `grep -q "^${key}="`
// treated the bare prefix match as "present". This fixture reproduces that
// exact shape for one required key.
const EMPTY_VALUE_FIXTURE = [
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=',
  'EXPO_PUBLIC_SENTRY_DSN=https://sentry.example/1',
  'EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=rc_ios_abc',
  'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=rc_android_abc',
].join('\n');

describe('Mobile CI native build public Expo env', () => {
  it.each(NATIVE_BUILD_JOBS)(
    'does not source denied public Expo keys from GH secrets into %s job env',
    (jobName) => {
      // WI-2301: a GH-secret-sourced job env var is a different value store
      // than the EAS Environment Variables the cloud `eas build` job reads —
      // setting it here never reaches the builder. Guards against
      // reintroducing that dead/misleading pattern.
      const env = getJob(jobName).env ?? {};
      for (const key of REQUIRED_EAS_ENV_KEYS) {
        expect(env).not.toHaveProperty(key);
      }
    },
  );

  it.each(NATIVE_BUILD_JOBS)(
    'verifies required EAS env vars before EAS build in %s',
    (jobName) => {
      const steps = getJob(jobName).steps ?? [];
      const buildStepIndex = steps.findIndex((step) =>
        step.run?.includes('eas build'),
      );
      const verifyStepIndex = steps.findIndex((step) =>
        step.name?.startsWith('Verify EAS environment variables'),
      );

      expect(buildStepIndex).toBeGreaterThanOrEqual(0);
      expect(verifyStepIndex).toBeGreaterThanOrEqual(0);
      expect(verifyStepIndex).toBeLessThan(buildStepIndex);

      const verifyRun = steps[verifyStepIndex]?.run ?? '';
      expect(verifyRun).toContain('eas env:list');
      for (const key of REQUIRED_EAS_ENV_KEYS) {
        expect(verifyRun).toContain(key);
      }
      expect(verifyRun).toContain('exit 1');
    },
  );
});

describe('Mobile CI EAS env verification predicate (executed)', () => {
  it.each(NATIVE_BUILD_JOBS)(
    'passes when every required key has a non-empty value (%s)',
    (jobName) => {
      const { status, stderr } = runVerifyPredicate(
        jobName,
        PRESENT_NON_EMPTY_FIXTURE,
      );
      expect(stderr).toBe('');
      expect(status).toBe(0);
    },
  );

  it.each(NATIVE_BUILD_JOBS)(
    'catches a configured-but-empty EAS var as missing, not present (%s)',
    (jobName) => {
      const { status, stderr } = runVerifyPredicate(
        jobName,
        EMPTY_VALUE_FIXTURE,
      );
      expect(status).toBe(1);
      expect(stderr).toContain('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
      expect(stderr).not.toContain('EXPO_PUBLIC_SENTRY_DSN');
    },
  );
});

describe('EAS profile environment mapping', () => {
  it.each(Object.entries(EAS_PROFILE_ENVIRONMENTS))(
    'maps %s profile to EAS %s environment',
    (profile, environment) => {
      expect(easJson.build[profile]?.environment).toBe(environment);
    },
  );

  it.each(Object.keys(EAS_PROFILE_ENVIRONMENTS))(
    'keeps denied public keys out of committed %s eas.json env',
    (profile) => {
      const env = easJson.build[profile]?.env ?? {};
      for (const key of REQUIRED_EAS_ENV_KEYS) {
        expect(env).not.toHaveProperty(key);
      }
    },
  );
});
