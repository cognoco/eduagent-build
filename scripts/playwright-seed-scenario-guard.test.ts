import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const repoRoot = join(__dirname, '..');
const guardModulePath = join(__dirname, 'playwright-seed-scenario-guard.ts');

type ProjectInput = {
  name: string;
  dependencies?: string[];
  testMatch: RegExp;
};

type GuardModule = {
  collectSelectedPlaywrightSeedScenarios(input: {
    rootDir: string;
    testDir: string;
    projects: ProjectInput[];
    selectedProjects: string[];
  }): string[];
  assertDeployedSeedScenarioCoverage(input: {
    requiredScenarios: Iterable<string>;
    apiBaseUrl: string;
    headers: Record<string, string>;
    fetchImpl?: typeof fetch;
  }): Promise<void>;
};

function loadGuard(): GuardModule {
  expect(existsSync(guardModulePath)).toBe(true);
  return require(guardModulePath) as GuardModule;
}

function writeFixture(
  root: string,
  relativePath: string,
  source: string,
): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, source);
}

describe('[WI-2571] selected Playwright seed-scenario collector', () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'wi-2571-playwright-'));

    writeFixture(
      fixtureRoot,
      'e2e/fixtures/scenarios.ts',
      `
        export const authScenarios = {
          solo: { seedScenario: 'onboarding-complete' },
          family: { seedScenario: 'parent-multi-child' },
        } as const;
        export const optInScenarios = {
          audit: { seedScenario: 'mentor-audit-empty-adult' },
        } as const;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/test-seed.ts',
      `export async function seedScenario(input: { scenario: string }) { return input; }`,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/seed-and-sign-in.ts',
      `
        import { seedScenario } from './test-seed';
        export async function seedAndSignIn(input: { scenario: string }) {
          return seedScenario({ scenario: input.scenario });
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/auth.setup.ts',
      `
        import { authScenarios } from './fixtures/scenarios';
        import { seedScenario } from './helpers/test-seed';
        for (const scenario of Object.values(authScenarios)) {
          void seedScenario({ scenario: scenario.seedScenario });
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/v2.spec.ts',
      `
        import { seedAndSignIn } from './helpers/seed-and-sign-in';
        void seedAndSignIn({ scenario: 'v2-account-non-owner-child' });
        void seedAndSignIn({ scenario: 'v2-returning-learner' });
        void seedAndSignIn({ scenario: 'v2-journal-paper-trail' });
        void seedAndSignIn({ scenario: 'v2-account-non-owner-child' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/opt-in.spec.ts',
      `
        import { optInScenarios } from './fixtures/scenarios';
        import { seedScenario } from './helpers/test-seed';
        void seedScenario({ scenario: optInScenarios.audit.seedScenario });
      `,
    );
  });

  afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  it('includes setup/import closure and direct calls, deduplicates, and excludes an unselected opt-in project', () => {
    const { collectSelectedPlaywrightSeedScenarios } = loadGuard();

    expect(
      collectSelectedPlaywrightSeedScenarios({
        rootDir: fixtureRoot,
        testDir: join(fixtureRoot, 'e2e'),
        projects: [
          { name: 'setup', testMatch: /auth\.setup\.ts$/ },
          {
            name: 'v2-release',
            dependencies: ['setup'],
            testMatch: /v2\.spec\.ts$/,
          },
          { name: 'opt-in', testMatch: /opt-in\.spec\.ts$/ },
        ],
        selectedProjects: ['v2-release'],
      }),
    ).toEqual([
      'onboarding-complete',
      'parent-multi-child',
      'v2-account-non-owner-child',
      'v2-journal-paper-trail',
      'v2-returning-learner',
    ]);
  });
});

describe('[WI-2571] deployed seed-catalog assertion', () => {
  const apiBaseUrl = 'https://api-stg.example.test';
  const headers = { 'X-Test-Secret': 'do-not-log-this-secret' };

  it('permits execution when the deployed catalog covers every selected scenario', async () => {
    const { assertDeployedSeedScenarioCoverage } = loadGuard();

    await expect(
      assertDeployedSeedScenarioCoverage({
        requiredScenarios: ['onboarding-complete', 'parent-multi-child'],
        apiBaseUrl,
        headers,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              scenarios: ['parent-multi-child', 'onboarding-complete'],
            }),
            { status: 200 },
          ),
      }),
    ).resolves.toBeUndefined();
  });

  it('fails before execution with sorted named mismatches and no credential disclosure', async () => {
    const { assertDeployedSeedScenarioCoverage } = loadGuard();

    const promise = assertDeployedSeedScenarioCoverage({
      requiredScenarios: [
        'v2-returning-learner',
        'v2-account-non-owner-child',
        'v2-journal-paper-trail',
      ],
      apiBaseUrl,
      headers,
      fetchImpl: async () =>
        new Response(JSON.stringify({ scenarios: [] }), { status: 200 }),
    });

    await expect(promise).rejects.toThrow(
      `${apiBaseUrl}: missing scenarios: v2-account-non-owner-child, v2-journal-paper-trail, v2-returning-learner`,
    );
    await expect(promise).rejects.not.toThrow(headers['X-Test-Secret']);
  });

  it.each([
    [
      'unavailable endpoint',
      async () => {
        throw new Error('socket details that must stay private');
      },
      'catalog request failed',
    ],
    [
      'malformed catalog',
      async () => new Response(JSON.stringify({ scenarios: [42] })),
      'catalog response was malformed',
    ],
  ])('fails safely for an %s', async (_case, fetchImpl, expected) => {
    const { assertDeployedSeedScenarioCoverage } = loadGuard();

    const promise = assertDeployedSeedScenarioCoverage({
      requiredScenarios: ['onboarding-complete'],
      apiBaseUrl,
      headers,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(promise).rejects.toThrow(`${apiBaseUrl}: ${expected}`);
    await expect(promise).rejects.not.toThrow(headers['X-Test-Secret']);
    await expect(promise).rejects.not.toThrow('socket details');
  });
});

describe('[WI-2571] E2E workflow seed-catalog guard', () => {
  it('runs one union guard before the first selected suite in the required smoke job', () => {
    const workflow = parseYaml(
      require('node:fs').readFileSync(
        join(repoRoot, '.github', 'workflows', 'e2e-web.yml'),
        'utf8',
      ),
    ) as {
      jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    const runSmoke = workflow.jobs['run-smoke'];
    const scripts = (runSmoke?.steps ?? [])
      .map((step) => String(step.run ?? ''))
      .join('\n');
    const guardIndex = scripts.indexOf('playwright-seed-scenario-guard.ts');

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(
      scripts.indexOf('pnpm run test:e2e:web:v2'),
    );
    for (const project of [
      'v2-release',
      'smoke-auth',
      'smoke-learner',
      'smoke-parent',
      'smoke-accessibility',
      'smoke-transport-recovery',
    ]) {
      expect(scripts).toContain(`--project=${project}`);
    }
  });
});
