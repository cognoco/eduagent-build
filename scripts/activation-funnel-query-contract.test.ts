import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { activationEventTypeSchema } from '@eduagent/schemas';

const runbook = readFileSync(
  join(__dirname, '..', 'docs/runbooks/activation-funnel-queries.md'),
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

function isKeywordAt(sql: string, index: number, keyword: string): boolean {
  if (sql.slice(index, index + keyword.length).toUpperCase() !== keyword) {
    return false;
  }
  const before = sql[index - 1] ?? '';
  const after = sql[index + keyword.length] ?? '';
  return !/[A-Z0-9_]/i.test(before) && !/[A-Z0-9_]/i.test(after);
}

function outerSelectProjections(sql: string): string[] {
  const projections: string[] = [];
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let selectStart: number | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (inSingleQuote) {
      if (char === "'" && next === "'") index += 1;
      else if (char === "'") inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (char === '"' && next === '"') index += 1;
      else if (char === '"') inDoubleQuote = false;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;

    if (selectStart === null && isKeywordAt(sql, index, 'SELECT')) {
      selectStart = index + 'SELECT'.length;
      index += 'SELECT'.length - 1;
      continue;
    }
    if (selectStart !== null && isKeywordAt(sql, index, 'FROM')) {
      projections.push(sql.slice(selectStart, index).trim());
      selectStart = null;
      index += 'FROM'.length - 1;
    }
  }

  return projections;
}

function splitProjectionExpressions(projection: string): string[] {
  const expressions: string[] = [];
  let depth = 0;
  let start = 0;
  let inSingleQuote = false;

  for (let index = 0; index < projection.length; index += 1) {
    const char = projection[index];
    const next = projection[index + 1];
    if (inSingleQuote) {
      if (char === "'" && next === "'") index += 1;
      else if (char === "'") inSingleQuote = false;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      expressions.push(projection.slice(start, index).trim());
      start = index + 1;
    }
  }
  expressions.push(projection.slice(start).trim());
  return expressions;
}

function unsafeRawProjectionExpressions(projection: string): string[] {
  return splitProjectionExpressions(projection).filter((expression) => {
    if (/\bmetadata\b/i.test(expression)) return true;
    if (!/\b(profile_id|anonymous_id)\b/i.test(expression)) return false;
    return !/^count\s*\(\s*DISTINCT\s+activation_events\.(profile_id|anonymous_id)\s*\)\s+AS\s+(distinct_profiles|distinct_anon_ids)$/i.test(
      expression.replace(/\s+/g, ' '),
    );
  });
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
    const countQuery = contractSqlBlocks().find((sql) =>
      sql.includes('event_order(event_type, step_order)'),
    );
    expect(countQuery).toBeDefined();
    const documentedEvents = [
      ...(countQuery ?? '').matchAll(/\('([^']+)',\s*\d+\)/g),
    ].map((match) => match[1]);

    expect(documentedEvents.length).toBeGreaterThan(0);
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
    expect(contract).toContain('FROM subscription_payers');
    expect(contract).toContain(
      'JOIN subscription ON subscription.id = subscription_payers.subscription_id',
    );
    expect(contract).toContain('is_guardian');
    expect(contract).toContain('is_charge');
    expect(contract).toContain('is_supporter');
    expect(contract).toContain('is_supportee');
    expect(contract).toContain('is_payer');
    expect(contract).not.toContain('audience_segment');
    expect(contract).not.toContain('solo_owner');
    expect(contract).not.toMatch(/\bSELECT\s+\*/i);
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
    const projections = contractSqlBlocks().flatMap(outerSelectProjections);

    expect(runbook).toContain('Aggregate-only supported surface');
    expect(runbook).toContain(
      'does not select `profile_id`, `anonymous_id`, or `metadata` as raw output',
    );
    expect(runbook).toContain('No raw learning content');
    expect(runbook).toMatch(/app_opened[^.\n]*signed-in launches only/i);
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
    expect(projections).toHaveLength(4);
    for (const projection of projections) {
      expect(unsafeRawProjectionExpressions(projection)).toEqual([]);
    }
    expect(unsafeRawProjectionExpressions('profile_id, count(*)')).toEqual([
      'profile_id',
    ]);
    expect(
      unsafeRawProjectionExpressions('activation_events.metadata AS metadata'),
    ).toEqual(['activation_events.metadata AS metadata']);
  });
});
