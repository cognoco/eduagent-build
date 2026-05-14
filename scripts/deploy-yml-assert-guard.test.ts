// [CR-PR129-NEW-6] The "Assert correct DATABASE_URL secret is set for deploy
// target" step in .github/workflows/deploy.yml must fail-fast when
// inputs.api_environment is unrecognized. Previously the bash guard only had
// two `if`s (staging-secret-missing, production-secret-missing). If both
// IS_STAGING and IS_PRODUCTION evaluated to false — which happens for a typo,
// empty string, or any value GHA passes through that doesn't match the
// hard-coded equality checks — neither branch fired, the success echo printed,
// and the downstream `(... && DATABASE_URL_STAGING || DATABASE_URL_PRODUCTION)`
// ternary fell through to the production secret. That meant a misconfigured
// dispatch could run migrations on production.
//
// This test extracts the bash body of the assert step from the YAML and runs
// it through `bash` with the env vars set to every relevant combination,
// asserting the expected pass/fail outcome.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const yaml = readFileSync(
  join(repoRoot, '.github/workflows/deploy.yml'),
  'utf8',
);

function extractAssertScript(): string {
  // Locate the `Assert correct DATABASE_URL secret is set for deploy target`
  // step and pull its `run: |` body out. The body is the contiguous block of
  // 10-space-indented lines that follows the `run: |` line (8-space indent +
  // 2 for block scalar content).
  const lines = yaml.split('\n');
  const startIdx = lines.findIndex((l) =>
    l.includes(
      'name: Assert correct DATABASE_URL secret is set for deploy target',
    ),
  );
  if (startIdx < 0) {
    throw new Error('Could not find the assert step in deploy.yml');
  }
  const runIdx = lines.findIndex(
    (l, i) => i > startIdx && /^\s+run:\s*\|/.test(l),
  );
  if (runIdx < 0) {
    throw new Error('Could not find `run: |` after the assert step name');
  }
  const out: string[] = [];
  for (let i = runIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // Block scalar continues while indent >= run-block indent (10 spaces) OR
    // the line is empty. Stop at the next YAML key (less indentation, non-empty).
    if (line.length === 0) {
      out.push('');
      continue;
    }
    if (line.startsWith('          ')) {
      out.push(line.slice(10));
      continue;
    }
    break;
  }
  return out.join('\n');
}

type Scenario = {
  name: string;
  env: Record<string, string>;
  expect: 'pass' | 'fail';
  expectStderr?: RegExp;
};

const SCENARIOS: Scenario[] = [
  {
    name: 'push event (implicit staging) with staging secret set → pass',
    env: {
      IS_STAGING: 'true',
      IS_PRODUCTION: 'false',
      STAGING_SECRET_SET: 'true',
      PRODUCTION_SECRET_SET: 'true',
      API_ENVIRONMENT: '',
      EVENT_NAME: 'push',
    },
    expect: 'pass',
  },
  {
    name: 'workflow_dispatch staging with staging secret set → pass',
    env: {
      IS_STAGING: 'true',
      IS_PRODUCTION: 'false',
      STAGING_SECRET_SET: 'true',
      PRODUCTION_SECRET_SET: 'true',
      API_ENVIRONMENT: 'staging',
      EVENT_NAME: 'workflow_dispatch',
    },
    expect: 'pass',
  },
  {
    name: 'workflow_dispatch production with production secret set → pass',
    env: {
      IS_STAGING: 'false',
      IS_PRODUCTION: 'true',
      STAGING_SECRET_SET: 'true',
      PRODUCTION_SECRET_SET: 'true',
      API_ENVIRONMENT: 'production',
      EVENT_NAME: 'workflow_dispatch',
    },
    expect: 'pass',
  },
  {
    name: 'staging deploy but DATABASE_URL_STAGING unset → fail (existing guard)',
    env: {
      IS_STAGING: 'true',
      IS_PRODUCTION: 'false',
      STAGING_SECRET_SET: 'false',
      PRODUCTION_SECRET_SET: 'true',
      API_ENVIRONMENT: 'staging',
      EVENT_NAME: 'workflow_dispatch',
    },
    expect: 'fail',
    expectStderr: /DATABASE_URL_STAGING is empty or unset/,
  },
  {
    name: 'production deploy but DATABASE_URL_PRODUCTION unset → fail (existing guard)',
    env: {
      IS_STAGING: 'false',
      IS_PRODUCTION: 'true',
      STAGING_SECRET_SET: 'true',
      PRODUCTION_SECRET_SET: 'false',
      API_ENVIRONMENT: 'production',
      EVENT_NAME: 'workflow_dispatch',
    },
    expect: 'fail',
    expectStderr: /DATABASE_URL_PRODUCTION is empty or unset/,
  },
  // [CR-PR129-NEW-6] Regression cases: unrecognized api_environment must fail.
  {
    name: 'workflow_dispatch with typo "stg" → fail',
    env: {
      IS_STAGING: 'false',
      IS_PRODUCTION: 'false',
      STAGING_SECRET_SET: 'true',
      PRODUCTION_SECRET_SET: 'true',
      API_ENVIRONMENT: 'stg',
      EVENT_NAME: 'workflow_dispatch',
    },
    expect: 'fail',
    expectStderr: /neither staging nor production/,
  },
  {
    name: 'workflow_dispatch with empty api_environment → fail',
    env: {
      IS_STAGING: 'false',
      IS_PRODUCTION: 'false',
      STAGING_SECRET_SET: 'true',
      PRODUCTION_SECRET_SET: 'true',
      API_ENVIRONMENT: '',
      EVENT_NAME: 'workflow_dispatch',
    },
    expect: 'fail',
    expectStderr: /neither staging nor production/,
  },
  {
    name: 'workflow_dispatch with arbitrary "dev" → fail',
    env: {
      IS_STAGING: 'false',
      IS_PRODUCTION: 'false',
      STAGING_SECRET_SET: 'true',
      PRODUCTION_SECRET_SET: 'true',
      API_ENVIRONMENT: 'dev',
      EVENT_NAME: 'workflow_dispatch',
    },
    expect: 'fail',
    expectStderr: /neither staging nor production/,
  },
];

function runGuard(
  script: string,
  env: Record<string, string>,
): { code: number; output: string } {
  try {
    const stdout = execFileSync('bash', ['-c', script], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

describe('deploy.yml assert-database-url step', () => {
  const script = extractAssertScript();

  test('the extracted script is non-trivial', () => {
    expect(script.length).toBeGreaterThan(200);
    expect(script).toContain('IS_STAGING');
    expect(script).toContain('IS_PRODUCTION');
  });

  test('the defensive guard for unrecognized api_environment exists', () => {
    // The new guard must explicitly handle the both-false case before the
    // secret-presence checks, so a typo cannot fall through to the success echo.
    expect(script).toMatch(
      /IS_STAGING.*!=.*true.*\n.*IS_PRODUCTION.*!=.*true/s,
    );
  });

  for (const scenario of SCENARIOS) {
    test(scenario.name, () => {
      const { code, output } = runGuard(script, scenario.env);
      if (scenario.expect === 'pass') {
        expect({ code, output }).toEqual({
          code: 0,
          output: expect.stringContaining('Expected secret is set'),
        });
      } else {
        expect(code).not.toBe(0);
        if (scenario.expectStderr) {
          expect(output).toMatch(scenario.expectStderr);
        }
      }
    });
  }
});
