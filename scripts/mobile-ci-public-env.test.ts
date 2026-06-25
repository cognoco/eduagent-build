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

const NATIVE_BUILD_JOBS = ['build-preview', 'build-manual'] as const;

const REQUIRED_PUBLIC_BUILD_ENV = {
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
    '${{ secrets.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY_PREVIEW }}',
  EXPO_PUBLIC_SENTRY_DSN: '${{ secrets.EXPO_PUBLIC_SENTRY_DSN }}',
  EXPO_PUBLIC_REVENUECAT_API_KEY_IOS:
    '${{ secrets.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS }}',
  EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID:
    '${{ secrets.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID }}',
};

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
    'injects denied public Expo keys into %s',
    (jobName) => {
      expect(getJob(jobName).env).toEqual(
        expect.objectContaining(REQUIRED_PUBLIC_BUILD_ENV),
      );
    },
  );

  it.each(NATIVE_BUILD_JOBS)(
    'checks denied public Expo keys before EAS build in %s',
    (jobName) => {
      const steps = getJob(jobName).steps ?? [];
      const buildStepIndex = steps.findIndex((step) =>
        step.run?.includes('eas build'),
      );
      const verifyStepIndex = steps.findIndex(
        (step) => step.name === 'Verify Expo public build env',
      );

      expect(buildStepIndex).toBeGreaterThanOrEqual(0);
      expect(verifyStepIndex).toBeGreaterThanOrEqual(0);
      expect(verifyStepIndex).toBeLessThan(buildStepIndex);

      const verifyRun = steps[verifyStepIndex]?.run ?? '';
      for (const key of Object.keys(REQUIRED_PUBLIC_BUILD_ENV)) {
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
      for (const key of Object.keys(REQUIRED_PUBLIC_BUILD_ENV)) {
        expect(env).not.toHaveProperty(key);
      }
    },
  );
});
