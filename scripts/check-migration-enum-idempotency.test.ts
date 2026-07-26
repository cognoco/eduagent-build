import {
  addedNumberedMigrationPaths,
  findEnumAddValueViolations,
} from './check-migration-enum-idempotency';

describe('findEnumAddValueViolations', () => {
  it('rejects ALTER TYPE ADD VALUE without IF NOT EXISTS', () => {
    expect(
      findEnumAddValueViolations(
        'apps/api/drizzle/9999_add_status.sql',
        `ALTER TYPE "public"."status" ADD VALUE 'ready';`,
      ),
    ).toEqual([
      {
        path: 'apps/api/drizzle/9999_add_status.sql',
        statement: `ALTER TYPE "public"."status" ADD VALUE 'ready'`,
      },
    ]);
  });

  it('accepts ALTER TYPE ADD VALUE IF NOT EXISTS', () => {
    expect(
      findEnumAddValueViolations(
        'apps/api/drizzle/9999_add_status.sql',
        `AlTeR
         TyPe "public"."status"
         aDd VaLuE /* replay-safe */ If
         NoT ExIsTs 'ready';`,
      ),
    ).toEqual([]);
  });

  it('rejects mixed-case ALTER TYPE ADD VALUE split across lines', () => {
    expect(
      findEnumAddValueViolations(
        'apps/api/drizzle/9999_add_status.sql',
        `aLtEr TyPe "public"."status"
         AdD
         VaLuE 'ready'
         BEFORE 'done';`,
      ),
    ).toHaveLength(1);
  });

  it('ignores ALTER TYPE ADD VALUE text that appears only in comments', () => {
    expect(
      findEnumAddValueViolations(
        'apps/api/drizzle/9999_add_status.sql',
        `-- ALTER TYPE "status" ADD VALUE 'commented_out';
         /*
          * ALTER TYPE "status" ADD VALUE 'also_commented_out';
          */
         SELECT 'still safe';`,
      ),
    ).toEqual([]);
  });
});

describe('addedNumberedMigrationPaths', () => {
  it('selects only newly added numbered migrations', () => {
    expect(
      addedNumberedMigrationPaths(
        'A\tapps/api/drizzle/9999_add_status.sql\n' +
          'M\tapps/api/drizzle/0151_historical.sql\n' +
          'A\tapps/api/drizzle/README.md\n' +
          'A\tapps/api/drizzle/meta/9999_snapshot.json\n',
      ),
    ).toEqual(['apps/api/drizzle/9999_add_status.sql']);
  });
});
