import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('dictation completion key migration', () => {
  it('[WI-84 CI] is present in the Drizzle migration journal', () => {
    const journal = JSON.parse(
      readFileSync(join(__dirname, '../drizzle/meta/_journal.json'), 'utf8'),
    ) as { entries?: Array<{ tag?: string }> };

    expect(journal.entries?.map((entry) => entry.tag)).toContain(
      '0093_dictation_completion_key',
    );
  });

  it('[WI-84 automated review] backfills the same legacy key used by old clients', () => {
    const migration = readFileSync(
      join(__dirname, '../drizzle/0093_dictation_completion_key.sql'),
      'utf8',
    ).toLowerCase();

    expect(migration).toContain("md5('dictation-result:'");
    expect(migration).toContain('profile_id');
    expect(migration).toContain('date');
    expect(migration).toContain('mode');
    expect(migration).toContain(
      'add column "completion_key" uuid default gen_random_uuid()',
    );
    expect(migration).not.toContain('drop default');
    expect(migration).not.toContain('set "completion_key" = "id"');
  });

  it('[WI-84 review] keeps the legacy unique index for migration-before-deploy safety', () => {
    const migration = readFileSync(
      join(__dirname, '../drizzle/0093_dictation_completion_key.sql'),
      'utf8',
    ).toLowerCase();

    expect(migration).not.toContain(
      'drop index if exists "uniq_dictation_results_profile_date_mode"',
    );
    expect(migration).not.toContain(
      'create index if not exists "idx_dictation_results_profile_date_mode"',
    );
  });

  it('[WI-84 review] keeps the new completion-key index non-unique until the contract rollout', () => {
    const migration = readFileSync(
      join(__dirname, '../drizzle/0093_dictation_completion_key.sql'),
      'utf8',
    ).toLowerCase();

    expect(migration).toContain(
      'create index "idx_dictation_results_profile_completion_key"',
    );
    expect(migration).not.toContain(
      'create unique index "uniq_dictation_results_profile_completion_key"',
    );
  });

  it('[WI-84 review] models the rollout default so the contract migration can drop it', () => {
    const snapshot = JSON.parse(
      readFileSync(
        join(__dirname, '../drizzle/meta/0093_snapshot.json'),
        'utf8',
      ),
    ) as {
      tables?: Record<
        string,
        { columns?: Record<string, { default?: string }> }
      >;
    };
    const completionKey =
      snapshot.tables?.['public.dictation_results']?.columns?.[
        'completion_key'
      ];

    expect(completionKey?.default).toBe('gen_random_uuid()');

    const plan = readFileSync(
      join(
        __dirname,
        '../../../docs/superpowers/plans/2026-05-23-wi-84-data-durability.md',
      ),
      'utf8',
    ).toLowerCase();
    expect(plan).toContain('alter column "completion_key" drop default');
  });

  it('[WI-84 review] rollback leaves the preserved legacy unique index alone', () => {
    const rollback = readFileSync(
      join(__dirname, '../drizzle/0093_dictation_completion_key.rollback.md'),
      'utf8',
    ).toLowerCase();

    expect(rollback).toContain(
      'drop index if exists "idx_dictation_results_profile_completion_key"',
    );
    expect(rollback).toContain('drop column if exists "completion_key"');
    expect(rollback).not.toContain(
      'create unique index "uniq_dictation_results_profile_date_mode"',
    );
  });
});
