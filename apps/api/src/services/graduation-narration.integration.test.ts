/**
 * Break-test T8a — graduation restamps the contract and forces re-consent.
 * (S5 visibility-contract plan, `## Tests` → T8a.)
 *
 * When a supportee graduates into consent capability, every active accepted
 * contract about them must be RESTAMPED: status flips off `accepted` and the
 * contract version bumps, which forces a fresh acceptance before the supporter
 * can read again (the supporter read matches `status='accepted'` only). The
 * restamp also writes a `graduation_restamped` audit row and a
 * `graduation_contract_restamped` supportee-facing notice.
 *
 * The version bump (`graduation-narration.ts:39`, `contractVersion + 1`) is the
 * re-consent trigger; remove it and a stale acceptance silently rides through →
 * red.
 *
 * Doc-vs-code: the S5 plan mentions a notice `metadata.whatChanges`. No such
 * field is written; the payload is schema-frozen to
 * `{supporterPersonId, occurredAt, contractVersion}`
 * (`graduationContractRestampedPayloadSchema`). This test pins the three REAL
 * fields, matching current behavior (AGENTS.md "Tests Must Reflect Reality").
 *
 * Real Neon DB, no internal mocks.
 */

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

import { restampGraduationContracts } from './graduation-narration';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

const NOW = new Date('2026-06-22T12:00:00.000Z');
const GRADUATED_AT = new Date('2026-06-29T09:00:00.000Z');

function createIntegrationDb(): Database {
  return createDatabase(process.env.DATABASE_URL!);
}

(RUN ? describe : describe.skip)(
  'restampGraduationContracts (integration) [T8a]',
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

    async function seedAcceptedContract(): Promise<{
      supporterId: string;
      supporteeId: string;
      supportershipId: string;
      contractId: string;
    }> {
      const [supporter] = await db
        .insert(person)
        .values({
          displayName: 'T8a Supporter',
          birthDate: '1980-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      const [supportee] = await db
        .insert(person)
        .values({
          displayName: 'T8a Supportee',
          birthDate: '2013-01-01',
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

      const [contract] = await db
        .insert(supportVisibilityContracts)
        .values({
          supportershipId: edge!.id,
          supporterPersonId: supporter!.id,
          supporteePersonId: supportee!.id,
          relation: 'parent',
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
        supporterId: supporter!.id,
        supporteeId: supportee!.id,
        supportershipId: edge!.id,
        contractId: contract!.id,
      };
    }

    it('restamps the contract, bumps the version, and writes the audit + notice', async () => {
      const seeded = await seedAcceptedContract();

      const result = await restampGraduationContracts(db, {
        personId: seeded.supporteeId,
        occurredAt: GRADUATED_AT,
      });
      expect(result.restamped).toBe(1);

      // Contract is restamped off `accepted` (forces re-consent) and bumped.
      const contract = await db.query.supportVisibilityContracts.findFirst({
        where: eq(supportVisibilityContracts.id, seeded.contractId),
      });
      expect(contract!.status).toBe('restamped');
      expect(contract!.contractVersion).toBe(2);

      // Audit row records the prior version for the trail.
      const audit = await db.query.supportVisibilityAuditEvents.findMany({
        where: eq(
          supportVisibilityAuditEvents.supportershipId,
          seeded.supportershipId,
        ),
      });
      const restampEvents = audit.filter(
        (e) => e.eventType === 'graduation_restamped',
      );
      expect(restampEvents).toHaveLength(1);
      expect(restampEvents[0]!.payload).toMatchObject({
        personId: seeded.supporteeId,
        priorContractVersion: 1,
      });

      // Supportee-facing notice with the three real payload fields.
      const notices = await db.query.supportVisibilityNotices.findMany({
        where: eq(
          supportVisibilityNotices.supportershipId,
          seeded.supportershipId,
        ),
      });
      expect(notices).toHaveLength(1);
      const notice = notices[0]!;
      expect(notice.noticeType).toBe('graduation_contract_restamped');
      expect(notice.targetAudience).toBe('supportee');
      expect(notice.targetPersonId).toBe(seeded.supporteeId);
      expect(notice.payload).toMatchObject({
        supporterPersonId: seeded.supporterId,
        occurredAt: GRADUATED_AT.toISOString(),
        contractVersion: 2,
      });
    });
  },
);
