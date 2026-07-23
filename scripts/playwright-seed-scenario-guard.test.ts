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

function collectShapeScenarios(root: string): string[] {
  const { collectSelectedPlaywrightSeedScenarios } = loadGuard();
  return collectSelectedPlaywrightSeedScenarios({
    rootDir: root,
    testDir: join(root, 'e2e'),
    projects: [{ name: 'shape', testMatch: /shape\.spec\.ts$/ }],
    selectedProjects: ['shape'],
  });
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
        import { seedAndSignIn as establishSession } from './helpers/seed-and-sign-in';
        import { seedScenario as mySeed } from './helpers/test-seed';
        void establishSession({ scenario: 'v2-account-non-owner-child' });
        void establishSession({ scenario: 'v2-returning-learner' });
        void establishSession({ scenario: 'v2-journal-paper-trail' });
        void establishSession({ scenario: 'v2-account-non-owner-child' });
        void establishSession({ scenario: 'aliased-selected-scenario' });
        void mySeed({ scenario: 'direct-aliased-scenario' });
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
      'aliased-selected-scenario',
      'direct-aliased-scenario',
      'onboarding-complete',
      'parent-multi-child',
      'v2-account-non-owner-child',
      'v2-journal-paper-trail',
      'v2-returning-learner',
    ]);
  });

  it('resolves default-imported wrappers exported as declarations and identifiers', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-declaration.ts',
      `
        import { seedScenario } from './test-seed';
        export default async function seedWithDefaultDeclaration(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-identifier.ts',
      `
        import { seedScenario } from './test-seed';
        const seedWithDefaultIdentifier = async (input: { scenario: string }) =>
          seedScenario(input);
        export default seedWithDefaultIdentifier;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import seedWithDeclaration from './helpers/default-declaration';
        import seedWithIdentifier from './helpers/default-identifier';
        void seedWithDeclaration({ scenario: 'default-declaration-scenario' });
        void seedWithIdentifier({ scenario: 'default-identifier-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'default-declaration-scenario',
      'default-identifier-scenario',
    ]);
  });

  it('resolves an anonymous default-exported wrapper expression', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-expression.ts',
      `
        import { seedScenario } from './test-seed';
        export default async (input: { scenario: string }) => seedScenario(input);
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import seedWithDefaultExpression from './helpers/default-expression';
        void seedWithDefaultExpression({ scenario: 'default-expression-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'default-expression-scenario',
    ]);
  });

  it('resolves a parenthesized anonymous default-exported wrapper expression', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/parenthesized-default-expression.ts',
      `
        import { seedScenario } from './test-seed';
        export default (async (input: { scenario: string }) => seedScenario(input));
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import seedWithParenthesizedDefault from './helpers/parenthesized-default-expression';
        void seedWithParenthesizedDefault({
          scenario: 'parenthesized-default-expression-scenario',
        });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'parenthesized-default-expression-scenario',
    ]);
  });

  it('preserves side-effect static import closure', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/side-effect-fixture.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'side-effect-call-scenario' });
        export const sideEffectRecord = {
          seedScenario: 'side-effect-record-scenario',
        };
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `import './helpers/side-effect-fixture';`,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'side-effect-call-scenario',
      'side-effect-record-scenario',
    ]);
  });

  it('preserves side-effect imports owned by a re-export barrel', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/barrel-register.ts',
      `
        import { seedScenario } from './test-seed';
        void seedScenario({ scenario: 'barrel-register-scenario' });
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/barrel-leaf.ts',
      `
        import { seedScenario } from './test-seed';
        export async function barrelWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/barrel-with-side-effect.ts',
      `
        import './barrel-register';
        export { barrelWrapper } from './barrel-leaf';
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { barrelWrapper } from './helpers/barrel-with-side-effect';
        void barrelWrapper({ scenario: 'barrel-selected-call-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'barrel-register-scenario',
      'barrel-selected-call-scenario',
    ]);
  });

  it('resolves namespace member calls and local export aliases', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/namespace-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function namespaceWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/local-export-alias.ts',
      `
        import { seedScenario } from './test-seed';
        async function internalWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
        export { internalWrapper as publicWrapper };
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import * as namespaceHelpers from './helpers/namespace-wrapper';
        import { publicWrapper } from './helpers/local-export-alias';
        void namespaceHelpers.namespaceWrapper({ scenario: 'namespace-scenario' });
        void publicWrapper({ scenario: 'local-export-alias-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'local-export-alias-scenario',
      'namespace-scenario',
    ]);
  });

  it('resolves bracket and destructured namespace member aliases', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/static-namespace-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function staticNamespaceWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import * as namespaceHelpers from './helpers/static-namespace-wrapper';
        const { staticNamespaceWrapper: selectedWrapper } = namespaceHelpers;
        void namespaceHelpers['staticNamespaceWrapper']({
          scenario: 'namespace-bracket-scenario',
        });
        void selectedWrapper({ scenario: 'namespace-destructured-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'namespace-bracket-scenario',
      'namespace-destructured-scenario',
    ]);
  });

  it('resolves bracket and destructured members of an exported namespace', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/exported-namespace-leaf.ts',
      `
        import { seedScenario } from './test-seed';
        export async function exportedNamespaceWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/exported-namespace-barrel.ts',
      `export * as seedNamespace from './exported-namespace-leaf';`,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { seedNamespace } from './helpers/exported-namespace-barrel';
        const { exportedNamespaceWrapper: selectedWrapper } = seedNamespace;
        void seedNamespace['exportedNamespaceWrapper']({
          scenario: 'exported-namespace-bracket-scenario',
        });
        void selectedWrapper({
          scenario: 'exported-namespace-destructured-scenario',
        });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'exported-namespace-bracket-scenario',
      'exported-namespace-destructured-scenario',
    ]);
  });

  it('resolves named, aliased, default, and star barrel re-exports', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/named-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function namedWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-barrel-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export default async function defaultBarrelWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/default-through-barrel.ts',
      `
        import { seedScenario } from './test-seed';
        const defaultThroughBarrel = async (input: { scenario: string }) =>
          seedScenario(input);
        export default defaultThroughBarrel;
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/star-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function starWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/index.ts',
      `
        export { namedWrapper } from './named-wrapper';
        export { namedWrapper as aliasedWrapper } from './named-wrapper';
        export { default as defaultAliasedWrapper } from './default-barrel-wrapper';
        export { default } from './default-through-barrel';
        export * from './star-wrapper';
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import defaultThroughBarrel, {
          aliasedWrapper,
          defaultAliasedWrapper,
          namedWrapper,
          starWrapper,
        } from './helpers';
        void namedWrapper({ scenario: 'barrel-named-scenario' });
        void aliasedWrapper({ scenario: 'barrel-aliased-scenario' });
        void defaultAliasedWrapper({ scenario: 'barrel-default-alias-scenario' });
        void defaultThroughBarrel({ scenario: 'barrel-default-scenario' });
        void starWrapper({ scenario: 'barrel-star-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual([
      'barrel-aliased-scenario',
      'barrel-default-alias-scenario',
      'barrel-default-scenario',
      'barrel-named-scenario',
      'barrel-star-scenario',
    ]);
  });

  it('resolves multi-hop aliased wrapper and re-export chains', () => {
    writeFixture(
      fixtureRoot,
      'e2e/helpers/leaf-wrapper.ts',
      `
        import { seedScenario } from './test-seed';
        export async function leafWrapper(input: { scenario: string }) {
          return seedScenario(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/middle-wrapper.ts',
      `
        import { leafWrapper as callLeaf } from './leaf-wrapper';
        export async function middleWrapper(input: { scenario: string }) {
          return callLeaf(input);
        }
      `,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/first-barrel.ts',
      `export { middleWrapper as firstHop } from './middle-wrapper';`,
    );
    writeFixture(
      fixtureRoot,
      'e2e/helpers/index.ts',
      `export { firstHop as chainedWrapper } from './first-barrel';`,
    );
    writeFixture(
      fixtureRoot,
      'e2e/shape.spec.ts',
      `
        import { chainedWrapper as selectedWrapper } from './helpers';
        void selectedWrapper({ scenario: 'multi-hop-scenario' });
      `,
    );

    expect(collectShapeScenarios(fixtureRoot)).toEqual(['multi-hop-scenario']);
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
