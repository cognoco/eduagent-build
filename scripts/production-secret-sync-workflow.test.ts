import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const workflowPath = join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'production-secret-sync.yml',
);
const deployWorkflowPath = join(
  __dirname,
  '..',
  '.github',
  'workflows',
  'deploy.yml',
);

describe('[WI-1641] production secret-sync workflow', () => {
  const source = readFileSync(workflowPath, 'utf8');
  const workflow = parse(source);
  const deployWorkflow = parse(readFileSync(deployWorkflowPath, 'utf8'));

  it('runs every 30 minutes and supports an operator-triggered retry', () => {
    expect(workflow.on.schedule).toEqual([{ cron: '17,47 * * * *' }]);
    expect(workflow.on.workflow_dispatch).toEqual({});
  });

  it('is default-branch-only, serialized, and least privilege', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency).toEqual({
      group: 'deploy-production',
      'cancel-in-progress': false,
    });
    expect(deployWorkflow.concurrency.group).toContain("'deploy-production'");
    expect(workflow.jobs.sync.if).toContain("github.ref == 'refs/heads/main'");
    expect(workflow.jobs.sync.permissions).toEqual({
      contents: 'read',
      issues: 'write',
    });
  });

  it('hard-fails missing credentials, explicitly targets prd, and verifies health', () => {
    const steps = workflow.jobs.sync.steps as Array<{
      name?: string;
      run?: string;
      env?: Record<string, string>;
    }>;
    const preflight = steps.find(
      (step) => step.name === 'Assert production sync credentials',
    );
    const sync = steps.find(
      (step) => step.name === 'Sync Doppler prd to production Worker',
    );
    const health = steps.find(
      (step) => step.name === 'Verify production environment health',
    );

    expect(preflight?.run).toContain('DOPPLER_TOKEN_PRD');
    expect(preflight?.run).toContain('CLOUDFLARE_API_TOKEN');
    expect(preflight?.run).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(preflight?.env).toEqual({
      DOPPLER_TOKEN_PRD: '${{ secrets.DOPPLER_TOKEN_PRD }}',
      CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CF_ACCOUNT_ID }}',
    });
    expect(sync?.env).toEqual({
      DOPPLER_TOKEN: '${{ secrets.DOPPLER_TOKEN_PRD }}',
      CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CF_ACCOUNT_ID }}',
      WRANGLER_SYNC_CONFIG: '${{ runner.temp }}/wrangler-secret-sync.jsonc',
    });
    expect(sync?.run).toContain('WRANGLER_SYNC_CONFIG');
    expect(sync?.run).toContain('pnpm secrets:sync prd');
    expect(health?.run).toContain('https://api.mentomate.com/v1/health');
    expect(health?.run).toContain('ENV_VALIDATION_ERROR');
  });

  it('uses SHA-pinned actions and deduplicates scheduled failure issues', () => {
    const steps = workflow.jobs.sync.steps as Array<{
      name?: string;
      uses?: string;
      with?: { script?: string };
    }>;
    const actions = steps.filter((step) => step.uses);
    for (const step of actions) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
    }
    const notify = steps.find(
      (step) => step.name === 'Notify on sync or health failure',
    );
    expect(notify?.with?.script).toContain('issues.listForRepo');
    expect(notify?.with?.script).toContain('github.paginate');
    expect(notify?.with?.script).toContain('issues.createComment');
    expect(notify?.with?.script).toContain('existing.updated_at');
    expect(notify?.with?.script).toContain(
      'Production worker secret sync failed',
    );
  });
});
