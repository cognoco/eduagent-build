// Unit tests for the migration-immutability ratchet (BUG-886). The pure
// functions take raw `git diff --name-status` strings, so no git or filesystem
// is mocked — real logic against real inputs.

import {
  findViolations,
  migrationTag,
  parseNameStatus,
  resolveRange,
  type Change,
} from './check-migration-immutability';

describe('migrationTag', () => {
  it('extracts the tag from a numbered migration .sql path', () => {
    expect(
      migrationTag('apps/api/drizzle/0088_bug363_dedup_pairkey_category.sql'),
    ).toBe('0088_bug363_dedup_pairkey_category');
  });

  it('returns null for the journal and snapshots (drizzle bookkeeping)', () => {
    expect(migrationTag('apps/api/drizzle/meta/_journal.json')).toBeNull();
    expect(migrationTag('apps/api/drizzle/meta/0088_snapshot.json')).toBeNull();
  });

  it('returns null for non-migration paths', () => {
    expect(migrationTag('apps/api/src/index.ts')).toBeNull();
    expect(migrationTag('apps/api/drizzle/README.md')).toBeNull();
  });
});

describe('parseNameStatus', () => {
  it('parses modify/add/delete pairs', () => {
    const raw =
      'M\tapps/api/drizzle/0088_x.sql\n' +
      'A\tapps/api/drizzle/0122_y.sql\n' +
      'D\tapps/api/drizzle/0050_z.sql\n';
    expect(parseNameStatus(raw)).toEqual<Change[]>([
      { status: 'M', oldPath: 'apps/api/drizzle/0088_x.sql' },
      { status: 'A', oldPath: 'apps/api/drizzle/0122_y.sql' },
      { status: 'D', oldPath: 'apps/api/drizzle/0050_z.sql' },
    ]);
  });

  it('parses rename triples (status + similarity, old, new)', () => {
    const raw =
      'R100\tapps/api/drizzle/0088_old.sql\tapps/api/drizzle/0088_new.sql\n';
    expect(parseNameStatus(raw)).toEqual<Change[]>([
      {
        status: 'R',
        oldPath: 'apps/api/drizzle/0088_old.sql',
        newPath: 'apps/api/drizzle/0088_new.sql',
      },
    ]);
  });

  it('ignores blank lines', () => {
    expect(parseNameStatus('\n\n')).toEqual([]);
  });
});

describe('findViolations', () => {
  const empty = new Set<string>();

  it('flags a modified existing migration', () => {
    const changes = parseNameStatus('M\tapps/api/drizzle/0088_x.sql\n');
    expect(findViolations(changes, empty)).toEqual([
      { tag: '0088_x', path: 'apps/api/drizzle/0088_x.sql', status: 'M' },
    ]);
  });

  it('flags a deleted existing migration', () => {
    const changes = parseNameStatus('D\tapps/api/drizzle/0050_z.sql\n');
    expect(findViolations(changes, empty)).toEqual([
      { tag: '0050_z', path: 'apps/api/drizzle/0050_z.sql', status: 'D' },
    ]);
  });

  it('flags a renamed-away existing migration (on the old path)', () => {
    const changes = parseNameStatus(
      'R100\tapps/api/drizzle/0088_old.sql\tapps/api/drizzle/0088_new.sql\n',
    );
    expect(findViolations(changes, empty)).toEqual([
      { tag: '0088_old', path: 'apps/api/drizzle/0088_old.sql', status: 'R' },
    ]);
  });

  it('does NOT flag adding a new migration', () => {
    const changes = parseNameStatus('A\tapps/api/drizzle/0122_new.sql\n');
    expect(findViolations(changes, empty)).toEqual([]);
  });

  it('does NOT flag journal/snapshot churn that accompanies a new migration', () => {
    const changes = parseNameStatus(
      'A\tapps/api/drizzle/0122_new.sql\n' +
        'M\tapps/api/drizzle/meta/_journal.json\n' +
        'A\tapps/api/drizzle/meta/0122_snapshot.json\n',
    );
    expect(findViolations(changes, empty)).toEqual([]);
  });

  it('skips an allowlisted tag', () => {
    const changes = parseNameStatus('M\tapps/api/drizzle/0088_x.sql\n');
    expect(findViolations(changes, new Set(['0088_x']))).toEqual([]);
  });

  it('reports every offending migration in a mixed diff', () => {
    const changes = parseNameStatus(
      'M\tapps/api/drizzle/0088_x.sql\n' +
        'A\tapps/api/drizzle/0122_new.sql\n' +
        'D\tapps/api/drizzle/0050_z.sql\n' +
        'M\tapps/api/src/index.ts\n',
    );
    expect(findViolations(changes, empty)).toEqual([
      { tag: '0088_x', path: 'apps/api/drizzle/0088_x.sql', status: 'M' },
      { tag: '0050_z', path: 'apps/api/drizzle/0050_z.sql', status: 'D' },
    ]);
  });
});

describe('resolveRange', () => {
  const original = process.env.GITHUB_BASE_REF;
  afterEach(() => {
    if (original === undefined) delete process.env.GITHUB_BASE_REF;
    else process.env.GITHUB_BASE_REF = original;
  });

  it('uses origin/<base>...HEAD when GITHUB_BASE_REF is set (CI/PR mode)', () => {
    process.env.GITHUB_BASE_REF = 'main';
    expect(resolveRange()).toEqual(['origin/main...HEAD']);
  });

  it('falls back to the staged index when GITHUB_BASE_REF is unset', () => {
    delete process.env.GITHUB_BASE_REF;
    expect(resolveRange()).toEqual(['--cached']);
  });
});
