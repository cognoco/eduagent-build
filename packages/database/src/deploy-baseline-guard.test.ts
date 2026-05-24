import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASELINE_SCRIPT = resolve(
  __dirname,
  '../scripts/baseline-migrations.mjs',
);
const PARENT_BRIDGE_MIGRATION = resolve(
  __dirname,
  '../../../apps/api/drizzle/0091_parent_bridge_topic_source.sql',
);

describe('deploy migration baseline guard', () => {
  it('does not mark new migrations applied after the journal is initialized', () => {
    const script = readFileSync(BASELINE_SCRIPT, 'utf8');

    const existingJournalGuard = script.indexOf('existingHashes.size > 0');
    const baselineInsert = script.indexOf(
      'INSERT INTO drizzle."__drizzle_migrations"',
    );

    expect(existingJournalGuard).toBeGreaterThanOrEqual(0);
    expect(baselineInsert).toBeGreaterThanOrEqual(0);
    expect(existingJournalGuard).toBeLessThan(baselineInsert);
    expect(script).toContain(
      'leaving missing migrations for drizzle-kit migrate',
    );
  });

  it('[WI-84 DS-008] normal deploy workflow does not run baseline-migrations before migrate', () => {
    const workflow = readFileSync(
      resolve(__dirname, '../../../.github/workflows/deploy.yml'),
      'utf8',
    );

    expect(workflow).not.toMatch(/Baseline migration journal/);
    expect(workflow).not.toMatch(/baseline-migrations\.mjs/);
    expect(workflow).toMatch(
      /api-deploy:[\s\S]*?- name: Run database migrations[\s\S]*?pnpm exec drizzle-kit migrate/,
    );
  });

  it('repairs the subscription Stripe event column drift before parent-bridge schema changes', () => {
    const migration = readFileSync(PARENT_BRIDGE_MIGRATION, 'utf8');

    const billingRepair = migration.indexOf(
      'ADD COLUMN IF NOT EXISTS "last_stripe_event_id"',
    );
    const parentBridgeColumn = migration.indexOf(
      'ADD COLUMN IF NOT EXISTS source_child_profile_id',
    );

    expect(billingRepair).toBeGreaterThanOrEqual(0);
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_account_stripe_event_id_idx"',
    );
    expect(parentBridgeColumn).toBeGreaterThanOrEqual(0);
    expect(billingRepair).toBeLessThan(parentBridgeColumn);
  });
});
