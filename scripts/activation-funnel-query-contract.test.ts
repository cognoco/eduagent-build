import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { activationEventTypeSchema } from '@eduagent/schemas';

const runbook = readFileSync(
  join(process.cwd(), 'docs/runbooks/activation-funnel-queries.md'),
  'utf8',
);

function contractSection(): string {
  const match = runbook.match(
    /<!-- activation-query-contract:start -->([\s\S]*?)<!-- activation-query-contract:end -->/,
  );
  if (!match?.[1]) {
    throw new Error('activation query contract markers are missing');
  }
  return match[1];
}

function contractSqlBlocks(): string[] {
  return [...contractSection().matchAll(/```sql\r?\n([\s\S]*?)```/g)].map(
    (match) => match[1] ?? '',
  );
}

describe('activation funnel query runbook', () => {
  it('defines an arbitrary half-open date range in every supported query', () => {
    const contract = contractSection();

    for (const sqlBlock of contractSqlBlocks()) {
      expect(sqlBlock).toContain(":'from_ts'::timestamptz AS from_ts");
      expect(sqlBlock).toContain(":'to_ts'::timestamptz AS to_ts");
      expect(sqlBlock).toContain('created_at >= params.from_ts');
      expect(sqlBlock).toContain('created_at < params.to_ts');
    }
    expect(contract).not.toContain('target_environment');
    expect(runbook).toContain('\\conninfo');
  });

  it('has an exact event-order bijection with the shared schema', () => {
    const [countQuery] = contractSqlBlocks();
    const documentedEvents = [
      ...(countQuery ?? '').matchAll(/\('([^']+)',\s*\d+\)/g),
    ].map((match) => match[1]);

    expect(documentedEvents).toEqual(activationEventTypeSchema.options);
  });

  it('uses independent current-model roles and capacities', () => {
    const contract = contractSection();

    expect(contract).not.toMatch(/\bJOIN\s+profiles\b/i);
    expect(contract).toContain('WITH profile_roles AS');
    expect(contract).toContain('GROUP BY membership.person_id');
    expect(contract).toContain('LEFT JOIN profile_roles');
    expect(contract).toContain('activation_events.profile_id IS NOT NULL');
    expect(contract).toContain('FROM guardianship');
    expect(contract).toContain('FROM supportership');
    expect(contract).toContain('FROM subscription');
    expect(contract).toContain('is_guardian');
    expect(contract).toContain('is_charge');
    expect(contract).toContain('is_supporter');
    expect(contract).toContain('is_supportee');
    expect(contract).toContain('is_payer');
    expect(contract).not.toContain('audience_segment');
    expect(contract).not.toContain('solo_owner');
    expect(contract).not.toMatch(/\bSELECT\s+\*/i);
    expect(contract).not.toContain('ae.metadata');
    expect(contract).toContain(
      'count(DISTINCT capacity_flags.profile_id) AS distinct_profiles',
    );
    expect(contract).toContain('grouped_capacity AS');
    expect(contract).toContain("'suppressed_remainder' AS segment_visibility");
    expect(contract).toContain('NULL::boolean AS is_admin');
    expect(contract).toContain('grouped_capacity.distinct_profiles >= 3');
    expect(contract).toContain('grouped_capacity.distinct_profiles < 3');
  });

  it('states and operationalizes the raw-row retention policy', () => {
    expect(runbook).toContain('121-day retention SLA');
    expect(runbook).toContain('delete after 90 days');
    expect(runbook).toContain("now() - interval '90 days' AS retention_cutoff");
    expect(runbook).toContain("created_at < :'retention_cutoff'::timestamptz");
    expect(runbook).toContain('monthly manual purge');
    expect(runbook).toContain('\\gset');
    expect(runbook).toContain('retention SLA breach');
    expect(runbook).toContain(
      "SET LOCAL idle_in_transaction_session_timeout = '5min'",
    );
    expect(runbook).toContain('`COMMIT` is an explicit operator decision');
    expect(runbook.indexOf('rows_eligible_for_deletion')).toBeLessThan(
      runbook.indexOf('BEGIN;'),
    );
  });

  it('documents the query-surface privacy boundary', () => {
    const contract = contractSection();

    expect(runbook).toContain('Aggregate-only supported surface');
    expect(runbook).toContain(
      'does not select `profile_id`, `anonymous_id`, or `metadata` as raw output',
    );
    expect(runbook).toContain('No raw learning content');
    expect(runbook).toMatch(/signed-in app opens only/i);
    expect(contract).not.toContain('first_seen');
    expect(contract).not.toContain('last_seen');
    expect(contract).toContain('returned_after_signup');
    expect(contract).not.toContain('day2_return_pct');
    expect(runbook).toContain(
      '`packages/database/src/schema/activation-events.ts`',
    );
    expect(runbook).toContain('direct foreign key to `person.id`');
    expect(runbook).toContain('right-censored');
    expect(runbook).toMatch(/all downstream conversion metrics/i);
  });
});
