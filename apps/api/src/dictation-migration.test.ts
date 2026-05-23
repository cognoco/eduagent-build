import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('dictation completion key migration', () => {
  it('[WI-84 CI] is present in the Drizzle migration journal', () => {
    const journal = JSON.parse(
      readFileSync(join(__dirname, '../drizzle/meta/_journal.json'), 'utf8'),
    ) as { entries?: Array<{ tag?: string }> };

    expect(journal.entries?.map((entry) => entry.tag)).toContain(
      '0092_dictation_completion_key',
    );
  });

  it('[WI-84 automated review] backfills the same legacy key used by old clients', () => {
    const migration = readFileSync(
      join(__dirname, '../drizzle/0092_dictation_completion_key.sql'),
      'utf8',
    ).toLowerCase();

    expect(migration).toContain("md5('dictation-result:'");
    expect(migration).toContain('profile_id');
    expect(migration).toContain('date');
    expect(migration).toContain('mode');
    expect(migration).not.toContain('set "completion_key" = "id"');
  });
});
