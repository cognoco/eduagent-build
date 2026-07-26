import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const REPO_ROOT = join(__dirname, '..');

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface WorkflowFile {
  jobs: {
    'publish-fallback-ota': {
      steps?: WorkflowStep[];
    };
  };
}

const workflow = parse(
  readFileSync(
    join(REPO_ROOT, '.github', 'workflows', 'mobile-fallback-ota.yml'),
    'utf8',
  ),
) as WorkflowFile;

function getPreflightStep(): WorkflowStep {
  const step = workflow.jobs['publish-fallback-ota'].steps?.find(
    (candidate) =>
      candidate.name === 'Verify required production publish secrets',
  );
  if (!step?.run) {
    throw new Error('Missing fallback OTA production-secret preflight step');
  }
  return step;
}

function getPublishStep(): WorkflowStep {
  const step = workflow.jobs['publish-fallback-ota'].steps?.find(
    (candidate) => candidate.name === 'Publish OTA update to fallback channel',
  );
  if (!step?.run) {
    throw new Error('Missing fallback OTA publish step');
  }
  return step;
}

function runPreflight(env: Record<string, string>): {
  status: number | null;
  stderr: string;
} {
  const result = spawnSync('bash', ['-c', getPreflightStep().run ?? ''], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
  return { status: result.status, stderr: result.stderr };
}

describe('Mobile fallback OTA RevenueCat production preflight', () => {
  it('requires the Google Play key and has no iOS key path', () => {
    const step = getPreflightStep();
    const publishStep = getPublishStep();

    expect(step.run).toContain('EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID');
    expect(step.run).not.toContain('EXPO_PUBLIC_REVENUECAT_API_KEY_IOS');
    expect(step.run).not.toContain('warn_env');
    expect(step.env?.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID).toBe(
      '${{ secrets.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID }}',
    );
    expect(step.env).not.toHaveProperty('EXPO_PUBLIC_REVENUECAT_API_KEY_IOS');
    expect(publishStep.env?.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID).toBe(
      '${{ secrets.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID }}',
    );
    expect(publishStep.env).not.toHaveProperty(
      'EXPO_PUBLIC_REVENUECAT_API_KEY_IOS',
    );
  });

  it('rejects publishing a fallback bundle when the Google Play key is empty', () => {
    const { status, stderr } = runPreflight({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_test',
      EXPO_PUBLIC_SENTRY_DSN: 'https://sentry.example/1',
      EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID: '',
    });

    expect(status).toBe(1);
    expect(stderr).toContain('EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID');
  });

  it('allows publishing when all required production values are present', () => {
    const { status } = runPreflight({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_test',
      EXPO_PUBLIC_SENTRY_DSN: 'https://sentry.example/1',
      EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID: 'goog_test',
    });

    expect(status).toBe(0);
  });
});
