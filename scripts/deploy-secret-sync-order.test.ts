// [BUG-803] In .github/workflows/deploy.yml the `api-deploy` job must sync
// Worker secrets from Doppler BEFORE switching traffic with `wrangler deploy`.
//
// Previously the order was: migrate → deploy (traffic switches) → sync. That
// meant a missing-token hard fail (BUG-238's guard) or any sync failure only
// surfaced AFTER the new code was already live and serving traffic with stale
// secrets — the exact silent stale-secret deploy BUG-238 set out to prevent.
//
// Correct order: migrate → sync secrets → deploy. The hard fail aborts before
// any traffic switch, and `wrangler deploy` inherits the freshly-synced
// secrets. This guard asserts that ordering so a future reshuffle can't
// regress it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const repoRoot = join(__dirname, '..');

type Step = { name?: string };

type RunStep = Step & { run?: string };

function apiDeploySteps(): Step[] {
  const doc = parse(
    readFileSync(join(repoRoot, '.github/workflows/deploy.yml'), 'utf8'),
  ) as { jobs?: Record<string, { steps?: Step[] }> };
  const job = doc.jobs?.['api-deploy'];
  if (!job?.steps) throw new Error('api-deploy job or its steps not found');
  return job.steps;
}

function indexOfStep(steps: Step[], name: string): number {
  const i = steps.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`step not found: ${name}`);
  return i;
}

function stepByName(steps: RunStep[], name: string): RunStep {
  const step = steps.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`step not found: ${name}`);
  return step;
}

describe('deploy.yml api-deploy step ordering', () => {
  const steps = apiDeploySteps();
  const migrate = indexOfStep(steps, 'Run database migrations');
  const sync = indexOfStep(steps, 'Sync secrets from Doppler to Worker');
  const deploy = indexOfStep(steps, 'Deploy to Cloudflare Workers');

  test('migrations run before secret sync (schema before secrets)', () => {
    expect(migrate).toBeLessThan(sync);
  });

  test('secret sync runs before the worker deploy (no stale-secret traffic switch)', () => {
    expect(sync).toBeLessThan(deploy);
  });

  test('[WI-1194] production requires the transcript purge flag before secret sync', () => {
    const syncStep = stepByName(
      steps as RunStep[],
      'Sync secrets from Doppler to Worker',
    );
    const run = syncStep.run ?? '';
    const retentionCheck = run.indexOf(
      'doppler secrets get RETENTION_PURGE_ENABLED',
    );
    const workerSync = run.indexOf('pnpm secrets:sync "$SYNC_TARGET"');

    expect(run).toContain('if [ "$SYNC_TARGET" = "prd" ]');
    expect(run).toContain('RETENTION_PURGE_ENABLED must be true');
    expect(run).toContain('SKIP_DOPPLER_SYNC cannot be used for production');
    expect(retentionCheck).toBeGreaterThanOrEqual(0);
    expect(workerSync).toBeGreaterThan(retentionCheck);
  });
});
