import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  person,
  supportVisibilityAuditEvents,
  supportVisibilityContracts,
  supportVisibilityNotices,
  supportership,
  type Database,
} from '@eduagent/database';
import { requestSelfUnlink } from './supportership-revocation';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

const NOW = new Date('2026-06-22T12:00:00.000Z');

type SeededSupportLink = {
  supporterId: string;
  supporteeId: string;
  supportershipId: string;
  contractId: string;
};

type FailureMode = 'contract-update';

function createIntegrationDb(): Database {
  return createDatabase(process.env.DATABASE_URL!);
}

function withInjectedFailure(db: Database, mode: FailureMode): Database {
  const wrap = (target: unknown): Database =>
    new Proxy(target as Record<PropertyKey, unknown>, {
      get(obj, prop, receiver) {
        if (prop === 'transaction') {
          return async (fn: (tx: Database) => Promise<unknown>) =>
            (target as Database).transaction(async (tx) =>
              fn(wrap(tx as unknown)),
            );
        }

        if (prop === 'update') {
          return (table: unknown) => {
            if (
              mode === 'contract-update' &&
              table === supportVisibilityContracts
            ) {
              throw new Error('Injected contract update failure');
            }
            return (target as { update(table: unknown): unknown }).update(
              table,
            );
          };
        }

        const value = Reflect.get(obj, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as Database;

  return wrap(db);
}

(RUN ? describe : describe.skip)(
  'requestSelfUnlink atomicity (integration) [WI-1000]',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const supportershipIds: string[] = [];

    beforeAll(() => {
      db = createIntegrationDb();
    });

    afterEach(async () => {
      for (const sid of supportershipIds) {
        await db
          .delete(supportVisibilityNotices)
          .where(eq(supportVisibilityNotices.supportershipId, sid));
        await db
          .delete(supportVisibilityAuditEvents)
          .where(eq(supportVisibilityAuditEvents.supportershipId, sid));
        await db
          .delete(supportVisibilityContracts)
          .where(eq(supportVisibilityContracts.supportershipId, sid));
        await db.delete(supportership).where(eq(supportership.id, sid));
      }
      for (const pid of personIds) {
        await db.delete(person).where(eq(person.id, pid));
      }
      supportershipIds.length = 0;
      personIds.length = 0;
    });

    async function seedSupportershipEdge(): Promise<{
      supporterId: string;
      supporteeId: string;
      supportershipId: string;
    }> {
      const [supporter] = await db
        .insert(person)
        .values({
          displayName: 'WI-1000 Supporter',
          birthDate: '1990-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      const [supportee] = await db
        .insert(person)
        .values({
          displayName: 'WI-1000 Supportee',
          birthDate: '2012-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(supporter!.id, supportee!.id);

      const [edge] = await db
        .insert(supportership)
        .values({
          supporterPersonId: supporter!.id,
          supporteePersonId: supportee!.id,
          grantedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning();
      supportershipIds.push(edge!.id);

      return {
        supporterId: supporter!.id,
        supporteeId: supportee!.id,
        supportershipId: edge!.id,
      };
    }

    async function seedAcceptedSupportLink(): Promise<SeededSupportLink> {
      const edge = await seedSupportershipEdge();

      const [contract] = await db
        .insert(supportVisibilityContracts)
        .values({
          supportershipId: edge.supportershipId,
          supporterPersonId: edge.supporterId,
          supporteePersonId: edge.supporteeId,
          relation: 'other',
          status: 'accepted',
          contractVersion: 1,
          reportableKinds: ['mastery'],
          artifactWall: true,
          renderEquivalence: true,
          safetyException: true,
          supporterAcceptedAt: NOW,
          supporteeAcceptedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning();

      return {
        supporterId: edge.supporterId,
        supporteeId: edge.supporteeId,
        supportershipId: edge.supportershipId,
        contractId: contract!.id,
      };
    }

    it('rolls back revokedAt when the contract update fails after the edge update', async () => {
      const seeded = await seedAcceptedSupportLink();
      const failingDb = withInjectedFailure(db, 'contract-update');

      await expect(
        requestSelfUnlink(failingDb, {
          supportershipId: seeded.supportershipId,
          callerPersonId: seeded.supporteeId,
          now: NOW,
        }),
      ).rejects.toThrow('Injected contract update failure');

      const edge = await db.query.supportership.findFirst({
        where: eq(supportership.id, seeded.supportershipId),
      });
      expect(edge!.revokedAt).toBeNull();
    });

    it('WI-1176: resolves and revokes without a schema-invalid synchronous notice write', async () => {
      const seeded = await seedAcceptedSupportLink();

      const notice = await requestSelfUnlink(db, {
        supportershipId: seeded.supportershipId,
        callerPersonId: seeded.supporteeId,
        now: NOW,
      });
      expect(notice.supportershipId).toBe(seeded.supportershipId);

      const edge = await db.query.supportership.findFirst({
        where: eq(supportership.id, seeded.supportershipId),
      });
      expect(edge!.revokedAt).toEqual(NOW);

      const contract = await db.query.supportVisibilityContracts.findFirst({
        where: eq(supportVisibilityContracts.id, seeded.contractId),
      });
      expect(contract!.status).toBe('revoked');

      const notices = await db.query.supportVisibilityNotices.findMany({
        where: eq(
          supportVisibilityNotices.supportershipId,
          seeded.supportershipId,
        ),
      });
      expect(notices).toHaveLength(0);
    });
  },
);
