import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  login,
  person,
  type Database,
} from '@eduagent/database';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;
const MIGRATION_SQL = readFileSync(
  resolve(
    __dirname,
    '../../../drizzle/0165_wi2895_credentialed_person_account_flag.sql',
  ),
  'utf8',
);

(RUN ? describe : describe.skip)(
  '[WI-2895] credentialed Person account-flag migration (integration)',
  () => {
    let db: Database;

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    it('repairs complete Person/Login bindings idempotently while leaving managed and incomplete Persons false', async () => {
      const rollback = new Error('WI-2895 migration test rollback');

      try {
        await db.transaction(async (tx) => {
          const txDb = tx as unknown as Database;
          const [credentialed, managed, incomplete] = await txDb
            .insert(person)
            .values([
              {
                displayName: 'Credentialed pre-fix Person',
                birthDate: '1990-01-01',
                residenceJurisdiction: 'EU',
              },
              {
                displayName: 'Managed Person',
                birthDate: '2012-01-01',
                residenceJurisdiction: 'EU',
              },
              {
                displayName: 'Incomplete credential binding',
                birthDate: '1995-01-01',
                residenceJurisdiction: 'EU',
              },
            ])
            .returning();

          const [credentialedLogin, incompleteLogin] = await txDb
            .insert(login)
            .values([
              {
                personId: credentialed!.id,
                clerkUserId: `wi2895-complete-${generateUUIDv7()}`,
                email: `wi2895-complete-${generateUUIDv7()}@test.local`,
              },
              {
                personId: incomplete!.id,
                clerkUserId: `wi2895-incomplete-${generateUUIDv7()}`,
                email: `wi2895-incomplete-${generateUUIDv7()}@test.local`,
              },
            ])
            .returning();
          await txDb
            .update(person)
            .set({ loginId: credentialedLogin!.id })
            .where(eq(person.id, credentialed!.id));

          // Applying the exact migration twice proves both its bounded target
          // and its idempotency. The incomplete Login intentionally lacks the
          // reverse person.login_id link.
          await tx.execute(sql.raw(MIGRATION_SQL));
          await tx.execute(sql.raw(MIGRATION_SQL));

          const repaired = await txDb.query.person.findFirst({
            where: eq(person.id, credentialed!.id),
          });
          const managedAfter = await txDb.query.person.findFirst({
            where: eq(person.id, managed!.id),
          });
          const incompleteAfter = await txDb.query.person.findFirst({
            where: eq(person.id, incomplete!.id),
          });

          expect(repaired?.hasOwnAccount).toBe(true);
          expect(managedAfter?.hasOwnAccount).toBe(false);
          expect(managedAfter?.loginId).toBeNull();
          expect(incompleteAfter?.hasOwnAccount).toBe(false);
          expect(incompleteLogin?.personId).toBe(incomplete!.id);

          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
    });
  },
);
