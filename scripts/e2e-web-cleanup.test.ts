// [BUG-979 / CCR-PR123-M-3] Structural tests pinning the cleanup wiring for
// the e2e-web workflow. Two layers of cleanup must exist:
//
// 1. An always-run reset step inside .github/workflows/e2e-web.yml that hits
//    the seed-reset endpoint independently of Playwright's globalTeardown
//    (which is bypassed when GitHub Actions cancels the runner).
// 2. A scheduled cleanup workflow (.github/workflows/e2e-web-cleanup.yml)
//    that sweeps any orphans missed by the per-job reset (e.g. SIGKILLed
//    runners).
//
// If either piece regresses we silently re-introduce the staging-DB pollution
// the bug report described, so the structural assertions below are the
// regression guard.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const repoRoot = join(__dirname, '..');

function loadWorkflow(name: string): unknown {
  const path = join(repoRoot, '.github', 'workflows', name);
  return parseYaml(readFileSync(path, 'utf8'));
}

describe('[BUG-979] e2e-web cleanup wiring', () => {
  describe('e2e-web.yml — per-run cleanup step', () => {
    const workflow = loadWorkflow('e2e-web.yml') as {
      jobs: { 'run-smoke': { steps: Array<Record<string, unknown>> } };
    };
    const steps = workflow.jobs['run-smoke'].steps;

    function findStep(prefix: string) {
      return steps.find((s) =>
        typeof s.name === 'string' ? s.name.startsWith(prefix) : false,
      );
    }

    it('declares a "Reset seeded staging accounts" step', () => {
      expect(findStep('Reset seeded staging accounts')).toBeDefined();
    });

    it('reset step runs with if: always() so it survives failure and graceful cancellation', () => {
      const step = findStep('Reset seeded staging accounts')!;
      expect(step.if).toBe('always()');
    });

    it('reset step calls POST /v1/__test/reset against the configured API', () => {
      const step = findStep('Reset seeded staging accounts')!;
      const run = String(step.run ?? '');
      expect(run).toMatch(/POST/);
      expect(run).toMatch(/\/v1\/__test\/reset/);
    });

    it('reset step passes the X-Test-Secret header', () => {
      const step = findStep('Reset seeded staging accounts')!;
      const run = String(step.run ?? '');
      expect(run).toMatch(/X-Test-Secret/);
    });

    it('reset step runs before the Upload Playwright artifacts step', () => {
      const reset = findStep('Reset seeded staging accounts')!;
      const upload = findStep('Upload Playwright artifacts')!;
      expect(steps.indexOf(reset)).toBeLessThan(steps.indexOf(upload));
    });

    it('reset step does not fail the job on a non-2xx response (nightly cleanup is the safety net)', () => {
      const step = findStep('Reset seeded staging accounts')!;
      const run = String(step.run ?? '');
      // The pipeline ends with `|| echo` so the curl exit code is masked.
      expect(run).toMatch(/\|\|\s*echo\s+"::warning::/);
    });
  });

  describe('e2e-web-cleanup.yml — scheduled safety-net workflow', () => {
    // PyYAML / yaml.parse interpret unquoted `on:` as the boolean `true`
    // when the YAML is loaded with default settings, but the `yaml` package
    // here keeps it as the string key `on`. We accept either to be robust.
    const workflow = loadWorkflow('e2e-web-cleanup.yml') as Record<
      string | number,
      unknown
    >;
    const triggers = (workflow.on ?? workflow[Number(true)]) as
      | Record<string, unknown>
      | undefined;

    it('declares a schedule trigger', () => {
      expect(triggers).toBeDefined();
      expect(triggers!.schedule).toBeDefined();
    });

    it('schedule has at least one cron entry', () => {
      const schedule = triggers!.schedule as Array<{ cron?: string }>;
      expect(schedule.length).toBeGreaterThan(0);
      expect(schedule[0]!.cron).toMatch(/\S/);
    });

    it('exposes a workflow_dispatch manual trigger for ad-hoc cleanup', () => {
      expect(triggers!).toHaveProperty('workflow_dispatch');
    });

    it('reset job calls POST /v1/__test/reset with the test secret', () => {
      const jobs = workflow.jobs as Record<
        string,
        { steps: Array<Record<string, unknown>> }
      >;
      const job = Object.values(jobs)[0]!;
      const stepWithCurl = job.steps.find((s) =>
        String(s.run ?? '').includes('/v1/__test/reset'),
      );
      expect(stepWithCurl).toBeDefined();
      const run = String(stepWithCurl!.run ?? '');
      expect(run).toMatch(/POST/);
      expect(run).toMatch(/X-Test-Secret/);
    });
  });
});
