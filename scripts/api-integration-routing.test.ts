import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const repoRoot = join(__dirname, '..');

type PackageJson = {
  scripts?: Record<string, string>;
};

type NxProject = {
  targets?: Record<string, { options?: { command?: string } }>;
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

describe('API co-located integration routing', () => {
  it('maps the root API integration script to the co-located API integration target', () => {
    const pkg = readJson<PackageJson>('package.json');
    const command = pkg.scripts?.['test:api:integration'] ?? '';

    expect(command).toContain('api:integration-api');
    expect(command).not.toContain('apps/api/jest.config.cjs');
  });

  it('keeps the cross-package target and exposes an unambiguous API co-located target', () => {
    const project = readJson<NxProject>('apps/api/project.json');
    const targets = project.targets ?? {};

    expect(targets['test:integration']?.options?.command).toContain(
      'tests/integration/jest.config.cjs',
    );
    expect(targets['integration-api']?.options?.command).toContain(
      'apps/api/jest.integration.config.cjs',
    );
    expect(targets['test-integration']).toBeUndefined();
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
    expect(coLocatedStep.run).toBe('pnpm exec nx run api:integration-api');
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

    expect(steps[index]?.run).toBe('pnpm exec nx run api:integration-api');
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
