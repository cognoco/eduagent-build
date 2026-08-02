import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { loadDatabaseEnv } from '../packages/test-utils/src/lib/load-database-env';
import { createMockDb } from '../packages/test-utils/src/lib/neon-mock';

const repoRoot = join(__dirname, '..');
const requireFromTest = createRequire(__filename);

type PackageJson = {
  scripts?: Record<string, string>;
};

type NxProject = {
  targets?: Record<string, { options?: { command?: string } }>;
};

type JestConfig = {
  setupFilesAfterEnv?: string[];
  testPathIgnorePatterns?: string[];
};

type WorkflowStep = {
  name?: string;
  if?: unknown;
  run?: unknown;
};

type WorkflowJob = {
  steps?: WorkflowStep[];
};

type Workflow = {
  jobs?: Record<string, WorkflowJob>;
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8')) as T;
}

function readWorkflow(relativePath: string): Workflow {
  return parseYaml(
    readFileSync(join(repoRoot, relativePath), 'utf8'),
  ) as Workflow;
}

function jobSteps(workflow: Workflow, jobId: string): WorkflowStep[] {
  const steps = workflow.jobs?.[jobId]?.steps;
  if (!steps) throw new Error(`Workflow job not found: ${jobId}`);
  return steps;
}

function stepIndex(steps: WorkflowStep[], name: string): number {
  const index = steps.findIndex((step) => step.name === name);
  if (index < 0) throw new Error(`Workflow step not found: ${name}`);
  return index;
}

function normalizeExpression(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

const unitRuntimeConfig = requireFromTest(
  join(repoRoot, 'apps/api/jest.config.cjs'),
) as JestConfig;
const integrationRuntimeConfig = requireFromTest(
  join(repoRoot, 'apps/api/jest.integration.config.cjs'),
) as JestConfig;
const stagingDatabaseEnvFixture = [
  'DATABASE_URL=postgresql://fake:fake@staging.invalid/fake_staging',
  'DOPPLER_PROJECT=mentomate',
  'DOPPLER_CONFIG=stg',
  'DOPPLER_ENVIRONMENT=stg',
  '',
].join('\n');

function probeDatabaseEnvSetup(): {
  integrationError: Error | undefined;
  integrationLoadCount: number;
  loadDatabaseEnvProbe: jest.Mock;
  preservesOtherTestUtilsExports: boolean;
  unitLoadCount: number;
} {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'wi-2806-env-fixture-'));
  const envKeys = [
    'DATABASE_URL',
    'DOPPLER_PROJECT',
    'DOPPLER_CONFIG',
    'DOPPLER_ENVIRONMENT',
    'NODE_ENV',
  ] as const;
  const previousEnv = { ...process.env };
  let resolveFixture = false;
  const loadDatabaseEnvProbe = jest.fn(() => {
    if (resolveFixture) loadDatabaseEnv(fixtureRoot);
  });
  let integrationError: Error | undefined;
  let unitLoadCount = 0;
  let integrationLoadCount = 0;
  let preservesOtherTestUtilsExports = false;

  writeFileSync(
    join(fixtureRoot, '.env.development.local'),
    stagingDatabaseEnvFixture,
  );

  for (const key of envKeys) delete process.env[key];
  process.env['NODE_ENV'] = 'test';

  try {
    jest.doMock(
      '@eduagent/test-utils' /* gc1-allow: scripts Jest cannot load the source barrel's .js specifiers */,
      () => ({
        createMockDb,
        loadDatabaseEnv: loadDatabaseEnvProbe,
      }),
    );
    const mockedTestUtils = jest.requireMock<{
      createMockDb: typeof createMockDb;
    }>('@eduagent/test-utils');
    preservesOtherTestUtilsExports =
      mockedTestUtils.createMockDb === createMockDb;
    jest.isolateModules(() => {
      for (const setupFile of unitRuntimeConfig.setupFilesAfterEnv ?? []) {
        void jest.requireActual<unknown>(setupFile);
      }
    });
    unitLoadCount = loadDatabaseEnvProbe.mock.calls.length;

    resolveFixture = true;
    try {
      jest.isolateModules(() => {
        const databaseSetup = integrationRuntimeConfig.setupFilesAfterEnv?.[0];
        if (!databaseSetup) {
          throw new Error('Integration database setup not found');
        }
        void jest.requireActual<unknown>(databaseSetup);
      });
    } catch (error) {
      integrationError =
        error instanceof Error ? error : new Error(String(error));
    }
    integrationLoadCount =
      loadDatabaseEnvProbe.mock.calls.length - unitLoadCount;
  } finally {
    jest.dontMock('@eduagent/test-utils');
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previousEnv);
    jest.setTimeout(5_000);
    rmSync(fixtureRoot, { recursive: true, force: true });
  }

  return {
    integrationError,
    integrationLoadCount,
    loadDatabaseEnvProbe,
    preservesOtherTestUtilsExports,
    unitLoadCount,
  };
}

const processEnvBeforeDatabaseEnvSetupProbe = { ...process.env };
const setTimeoutSpy = jest.spyOn(jest, 'setTimeout');
const databaseEnvSetupProbe = probeDatabaseEnvSetup();
const probeFinalTimeout = setTimeoutSpy.mock.calls.at(-1)?.[0];
setTimeoutSpy.mockRestore();

describe('API co-located integration routing', () => {
  it('keeps database setup exclusive to the integration Jest config', () => {
    const unitConfig = requireFromTest(
      join(repoRoot, 'apps/api/jest.config.cjs'),
    ) as JestConfig;
    const integrationConfig = requireFromTest(
      join(repoRoot, 'apps/api/jest.integration.config.cjs'),
    ) as JestConfig;

    expect(unitConfig.setupFilesAfterEnv).toEqual([
      join(repoRoot, 'tests/integration/api-setup.ts'),
      join(repoRoot, 'tests/unit/api-env-setup.ts'),
    ]);
    expect(unitConfig.testPathIgnorePatterns).toEqual(
      expect.arrayContaining([expect.stringMatching(/integration/)]),
    );
    expect(integrationConfig.setupFilesAfterEnv).toEqual([
      join(repoRoot, 'tests/integration/api-database-env-setup.ts'),
      join(repoRoot, 'tests/integration/api-setup.ts'),
    ]);

    const unitSafeSetup = readFileSync(
      join(repoRoot, 'tests/integration/api-setup.ts'),
      'utf8',
    );
    const databaseEnvSetup = readFileSync(
      join(repoRoot, 'tests/integration/api-database-env-setup.ts'),
      'utf8',
    );
    expect(unitSafeSetup).not.toContain('loadDatabaseEnv');
    expect(databaseEnvSetup).toContain('loadDatabaseEnv');
  });

  it('runs unit Jest without resolving an env:sync staging database file', () => {
    expect(stagingDatabaseEnvFixture).toContain('DOPPLER_CONFIG=stg');
    expect(stagingDatabaseEnvFixture).toContain('DOPPLER_ENVIRONMENT=stg');
    expect(databaseEnvSetupProbe.preservesOtherTestUtilsExports).toBe(true);
    expect(databaseEnvSetupProbe.unitLoadCount).toBe(0);
    expect(probeFinalTimeout).toBe(5_000);
  });

  it('loads the guarded database setup in integration Jest', () => {
    expect(databaseEnvSetupProbe.integrationLoadCount).toBe(1);
    expect(databaseEnvSetupProbe.loadDatabaseEnvProbe).toHaveBeenLastCalledWith(
      repoRoot,
    );
    expect(databaseEnvSetupProbe.integrationError?.message).toContain(
      'config=stg, environment=stg is shared/non-local',
    );
  });

  it('maps the root API integration script through the guarded launcher', () => {
    const pkg = readJson<PackageJson>('package.json');
    const command = pkg.scripts?.['test:api:integration'] ?? '';

    expect(command).toBe('node scripts/run-api-integration.mjs');
    expect(command).not.toContain('apps/api/jest.config.cjs');
    expect(pkg.scripts?.['test:api:integration:ci']).toBe(
      'node scripts/run-api-integration.mjs --nx',
    );
    expect(pkg.scripts?.['test:api:integration:cross-package:ci']).toBe(
      'node scripts/run-api-integration.mjs --cross-package',
    );
  });

  it('keeps the cross-package target and exposes an unambiguous API co-located target', () => {
    const project = readJson<NxProject>('apps/api/project.json');
    const targets = project.targets ?? {};

    expect(targets['test:integration']?.options?.command).toBe(
      'pnpm run test:api:integration:cross-package:ci',
    );
    expect(targets['integration-api']?.options?.command).toBe(
      'node scripts/run-api-integration.mjs --jest',
    );
    expect(targets['test-integration']).toBeUndefined();
  });

  it('documents targeted API integration through the pnpm lifecycle', () => {
    const runbook = readFileSync(
      join(repoRoot, 'docs/runbooks/local-db-testing.md'),
      'utf8',
    );

    expect(runbook).toContain(
      'pnpm run test:api:integration --jest apps/api/src/services/auth-scoping.integration.test.ts --runInBand --no-coverage',
    );
    expect(runbook).not.toContain(
      'node scripts/run-api-integration.mjs --jest apps/api/src/services/auth-scoping.integration.test.ts',
    );
  });

  it('documents the canonical CI lifecycle command', () => {
    const instructions = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');

    expect(instructions).toContain(
      'the API co-located suite is `pnpm run test:api:integration:ci`',
    );
    expect(instructions).not.toContain(
      'the API co-located suite is `pnpm exec nx run api:integration-api`',
    );
  });

  it('runs cross-package and API co-located integration suites serially under the same CI router condition', () => {
    const workflow = readWorkflow('.github/workflows/ci.yml');
    const steps = jobSteps(workflow, 'main');

    const crossPackageIndex = stepIndex(steps, 'API integration tests');
    const coLocatedIndex = stepIndex(
      steps,
      'API co-located integration tests (apps/api/src)',
    );

    const crossPackageStep = steps[crossPackageIndex]!;
    const coLocatedStep = steps[coLocatedIndex]!;

    expect(crossPackageStep.run).toBe('pnpm exec nx run api:test:integration');
    expect(coLocatedStep.run).toBe('pnpm run test:api:integration:ci');
    expect(normalizeExpression(coLocatedStep.if)).toBe(
      normalizeExpression(crossPackageStep.if),
    );
    expect(crossPackageIndex).toBeLessThan(coLocatedIndex);
  });

  it('uses the unambiguous API co-located target in the flag-on lane too', () => {
    const workflow = readWorkflow('.github/workflows/ci.yml');
    const steps = jobSteps(workflow, 'integration-flag-on');
    const index = stepIndex(
      steps,
      'API co-located integration tests (flag-ON, apps/api/src)',
    );

    expect(steps[index]?.run).toBe('pnpm run test:api:integration:ci');
  });

  it('wires the API co-located Jest config into the quarantine registry', () => {
    const config = readFileSync(
      join(repoRoot, 'apps/api/jest.integration.config.cjs'),
      'utf8',
    );

    expect(config).toContain(
      "require('../../tools/quarantine/registry.cjs').jestIgnorePatterns()",
    );
  });
});

afterAll(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, processEnvBeforeDatabaseEnvSetupProbe);
  expect(process.env).toEqual(processEnvBeforeDatabaseEnvSetupProbe);
});
