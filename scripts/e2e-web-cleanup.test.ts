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
      jobs: {
        'run-smoke': {
          env?: Record<string, unknown>;
          steps: Array<Record<string, unknown>>;
        };
      };
    };
    const runSmoke = workflow.jobs['run-smoke'];
    const steps = runSmoke.steps;

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

    it('declares a deterministic PLAYWRIGHT_RUN_ID shared by tests and cleanup', () => {
      const runId = String(runSmoke.env?.PLAYWRIGHT_RUN_ID ?? '');
      expect(runId).toContain('github.run_id');
      expect(runId).toContain('github.run_attempt');
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

    it('[WI-2820 P1] repeats full Worker cleanup batches for large V2 runs', () => {
      const step = findStep('Reset seeded staging accounts')!;
      const run = String(step.run ?? '');

      expect(run).toMatch(/MAX_CLEANUP_BATCHES=20/);
      expect(run).toMatch(
        /for BATCH in \$\(seq 1 "\$\{MAX_CLEANUP_BATCHES\}"\)/,
      );
      expect(run).toMatch(/clerkUsersDeleted/);
      expect(run).toMatch(/\[ "\$\{clerk_users_deleted\}" -lt 15 \]/);
    });

    it('reset step refuses an unknown prefix instead of using a fallback prefix', () => {
      const step = findStep('Reset seeded staging accounts')!;
      const run = String(step.run ?? '');
      expect(run).not.toContain('fallback');
      expect(run).toMatch(/PLAYWRIGHT_RUN_ID/);
      expect(run).toMatch(/::error::/);
    });

    // WI-2594: the "Upload legacy Playwright artifacts" step this test
    // ordered against was removed (it published fill-step values, e.g.
    // seeded login credentials, in clear text — see WI-2593). No successor
    // step exists to order the reset step against.

    it('reset step does not fail the job on a non-2xx response (nightly cleanup is the safety net)', () => {
      const step = findStep('Reset seeded staging accounts')!;
      const run = String(step.run ?? '');
      // The curl failures are converted to warnings so the nightly cleanup
      // safety net remains available during a staging incident.
      expect(run).toMatch(/\|\|\s*\{\s*echo\s+"::warning::/);
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

    it('[WI-2820 P1] runs local verified-ID cleanup through Doppler staging', () => {
      const jobs = workflow.jobs as Record<
        string,
        { steps: Array<Record<string, unknown>> }
      >;
      const job = Object.values(jobs)[0]!;
      expect(
        job.steps.some((step) =>
          String(step.uses ?? '').startsWith('actions/checkout@'),
        ),
      ).toBe(true);
      const cleanupStep = job.steps.find((s) =>
        String(s.run ?? '').includes('clean-clerk-test-users.mjs'),
      );
      expect(cleanupStep).toBeDefined();
      const run = String(cleanupStep!.run ?? '');
      expect(run).toMatch(/doppler run -p mentomate -c stg/);
      expect(run).toMatch(
        /node scripts\/clean-clerk-test-users\.mjs --older-than-hours=24 --execute/,
      );
      expect(run).toMatch(/DOPPLER_TOKEN/);
      expect(run).toMatch(/::error/);
      expect(run).not.toMatch(/curl[\s\S]*\/v1\/__test\/reset/);
    });
  });
});
