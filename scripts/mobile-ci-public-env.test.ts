import { readFileSync } from 'node:fs';
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
