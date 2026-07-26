/**
 * Break-tests T5a + T9a — visibility-link ceremony guards.
 * (S5 visibility-contract plan, `## Tests` → T5a, T9a.)
 *
 * Both guards live in `linking-ceremony.ts`, so they share this file.
 *
 * T5a — a supporter cannot read the shared record until BOTH the supporter AND
 *       the supportee have accepted. A one-sided acceptance leaves the contract
 *       `pending`, and `findAcceptedContractForSupportee` (which the supporter
 *       read route calls) 403s on anything but `accepted`. The both-accepted
 *       flip is `acceptLink` (`linking-ceremony.ts:144-145`):
 *         status = supporterAcceptedAt && supporteeAcceptedAt ? 'accepted' : …
 *       Drop the supportee conjunct → supporter-only accept leaks → red.
 *       Also pins that per-edge `relation` is capture-only: it never changes the
 *       authorization outcome.
 *
 * T9a — a MANAGED-tier link (under-13 supportee path) is gated server-side by
 *       `MANAGED_TIER_ACTIVE`. With the flag off, `initiateLink`
 *       (`linking-ceremony.ts:52-54`) throws ForbiddenError; a CREDENTIALED
 *       (non-managed) link succeeds regardless. The flag is derived server-side
 *       from `c.env.MANAGED_TIER_ACTIVE` and is NOT a body field, so a client
 *       cannot override it. Delete the guard → managed link with flag off
 *       succeeds → red.
 *
 * Real Neon DB, no internal mocks.
 */

import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';

import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  person,
  supportVisibilityAuditEvents,
  supportVisibilityContracts,
  supportership,
  type Database,
} from '@eduagent/database';
import { visibilityLinkInitiateSchema } from '@eduagent/schemas';

import { ForbiddenError } from '../errors';
import {
  acceptLink,
  findAcceptedContractForSupportee,
  initiateLink,
} from './linking-ceremony';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

const NOW = new Date('2026-06-29T12:00:00.000Z');

function createIntegrationDb(): Database {
  return createDatabase(process.env.DATABASE_URL!);
}

(RUN ? describe : describe.skip)(
  'visibility link ceremony guards (integration)',
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

    async function seedTwoPersons(): Promise<{
      supporterId: string;
      supporteeId: string;
    }> {
      const [supporter] = await db
        .insert(person)
        .values({
          displayName: 'Ceremony Supporter',
          birthDate: '1985-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      const [supportee] = await db
        .insert(person)
        .values({
          displayName: 'Ceremony Supportee',
          birthDate: '2010-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(supporter!.id, supportee!.id);
      return { supporterId: supporter!.id, supporteeId: supportee!.id };
    }

    // ---- T5a ----------------------------------------------------------------

    it('blocks the supporter read until BOTH sides accept [T5a]', async () => {
      const { supporterId, supporteeId } = await seedTwoPersons();

      const pending = await initiateLink(db, {
        supporterPersonId: supporterId,
        supporteePersonId: supporteeId,
        relation: 'other',
        managedTier: false,
        managedTierActive: false,
        now: NOW,
      });
      supportershipIds.push(pending.supportershipId);
      expect(pending.status).toBe('pending');

      // Supporter accepts their side only — still not mutually accepted.
      const afterSupporter = await acceptLink(db, pending.id, {
        actorPersonId: supporterId,
        audience: 'supporter',
        contractVersion: pending.contractVersion,
        now: NOW,
      });
      expect(afterSupporter.status).toBe('pending');

      // The supporter read must 403 while the contract is not `accepted`.
      await expect(
        findAcceptedContractForSupportee(db, {
          supporterPersonId: supporterId,
          supporteePersonId: supporteeId,
        }),
      ).rejects.toThrow(ForbiddenError);

      // Supportee accepts → mutual acceptance → `accepted`.
      const afterBoth = await acceptLink(db, pending.id, {
        actorPersonId: supporteeId,
        audience: 'supportee',
        contractVersion: pending.contractVersion,
        now: NOW,
      });
      expect(afterBoth.status).toBe('accepted');

      // Now the supporter read resolves.
      const visible = await findAcceptedContractForSupportee(db, {
        supporterPersonId: supporterId,
        supporteePersonId: supporteeId,
      });
      expect(visible.id).toBe(pending.id);
    });

    it('treats per-edge relation as capture-only — it never changes the gate [T5a]', async () => {
      const { supporterId, supporteeId } = await seedTwoPersons();

      // Identical fully-accepted ceremony, but relation `parent` instead of
      // `other`. The authorization outcome must be unchanged.
      const contract = await initiateLink(db, {
        supporterPersonId: supporterId,
        supporteePersonId: supporteeId,
        relation: 'parent',
        managedTier: false,
        managedTierActive: false,
        now: NOW,
      });
      supportershipIds.push(contract.supportershipId);

      await acceptLink(db, contract.id, {
        actorPersonId: supporterId,
        audience: 'supporter',
        contractVersion: contract.contractVersion,
        now: NOW,
      });
      const accepted = await acceptLink(db, contract.id, {
        actorPersonId: supporteeId,
        audience: 'supportee',
        contractVersion: contract.contractVersion,
        now: NOW,
      });
      expect(accepted.relation).toBe('parent');
      expect(accepted.status).toBe('accepted');

      const visible = await findAcceptedContractForSupportee(db, {
        supporterPersonId: supporterId,
        supporteePersonId: supporteeId,
      });
      // relation surfaces unchanged, and read is allowed purely on `accepted`.
      expect(visible.relation).toBe('parent');
      expect(visible.id).toBe(contract.id);
    });

    it('serializes simultaneous duplicate accepts into one write and one audit event', async () => {
      const { supporterId, supporteeId } = await seedTwoPersons();
      const contract = await initiateLink(db, {
        supporterPersonId: supporterId,
        supporteePersonId: supporteeId,
        relation: 'other',
        managedTier: false,
        managedTierActive: false,
        now: NOW,
      });
      supportershipIds.push(contract.supportershipId);

      const [first, second] = await Promise.all([
        acceptLink(db, contract.id, {
          actorPersonId: supporterId,
          audience: 'supporter',
          contractVersion: contract.contractVersion,
          now: NOW,
        }),
        acceptLink(db, contract.id, {
          actorPersonId: supporterId,
          audience: 'supporter',
          contractVersion: contract.contractVersion,
          now: new Date(NOW.getTime() + 1_000),
        }),
      ]);

      expect(first.supporterAcceptedAt).toBe(second.supporterAcceptedAt);
      const acceptAudits = await db.query.supportVisibilityAuditEvents.findMany(
        {
          where: and(
            eq(supportVisibilityAuditEvents.contractId, contract.id),
            eq(supportVisibilityAuditEvents.eventType, 'contract_accepted'),
          ),
        },
      );
      expect(acceptAudits).toHaveLength(1);
      expect(acceptAudits[0]?.payload).toMatchObject({
        audience: 'supporter',
        contractVersion: contract.contractVersion,
      });
    });

    it('preserves both sides when supporter and supportee accept simultaneously', async () => {
      const { supporterId, supporteeId } = await seedTwoPersons();
      const contract = await initiateLink(db, {
        supporterPersonId: supporterId,
        supporteePersonId: supporteeId,
        relation: 'other',
        managedTier: false,
        managedTierActive: false,
        now: NOW,
      });
      supportershipIds.push(contract.supportershipId);

      await Promise.all([
        acceptLink(db, contract.id, {
          actorPersonId: supporterId,
          audience: 'supporter',
          contractVersion: contract.contractVersion,
          now: NOW,
        }),
        acceptLink(db, contract.id, {
          actorPersonId: supporteeId,
          audience: 'supportee',
          contractVersion: contract.contractVersion,
          now: NOW,
        }),
      ]);

      const stored = await db.query.supportVisibilityContracts.findFirst({
        where: eq(supportVisibilityContracts.id, contract.id),
      });
      expect(stored).toMatchObject({
        status: 'accepted',
        supporterAcceptedAt: NOW,
        supporteeAcceptedAt: NOW,
      });
      const acceptAudits = await db.query.supportVisibilityAuditEvents.findMany(
        {
          where: and(
            eq(supportVisibilityAuditEvents.contractId, contract.id),
            eq(supportVisibilityAuditEvents.eventType, 'contract_accepted'),
          ),
        },
      );
      expect(acceptAudits).toHaveLength(2);
    });

    // ---- T9a ----------------------------------------------------------------

    it('gates a managed-tier link on MANAGED_TIER_ACTIVE; credentialed succeeds [T9a]', async () => {
      const { supporterId, supporteeId } = await seedTwoPersons();

      // Managed link, flag OFF → forbidden server-side. Guard runs before any
      // insert, so no supportership row should be created.
      await expect(
        initiateLink(db, {
          supporterPersonId: supporterId,
          supporteePersonId: supporteeId,
          relation: 'parent',
          managedTier: true,
          managedTierActive: false,
          now: NOW,
        }),
      ).rejects.toThrow(ForbiddenError);

      const edgesForSupporter = await db.query.supportership.findMany({
        where: eq(supportership.supporterPersonId, supporterId),
      });
      expect(edgesForSupporter).toHaveLength(0);

      // Credentialed (non-managed) link with the same flag OFF → succeeds.
      const credentialed = await initiateLink(db, {
        supporterPersonId: supporterId,
        supporteePersonId: supporteeId,
        relation: 'parent',
        managedTier: false,
        managedTierActive: false,
        now: NOW,
      });
      supportershipIds.push(credentialed.supportershipId);
      expect(credentialed.status).toBe('pending');
    });

    it('keeps MANAGED_TIER_ACTIVE server-side: the request body cannot carry it [T9a]', () => {
      // The initiate body schema has no `managedTierActive` field — the route
      // derives it from `c.env.MANAGED_TIER_ACTIVE`, so a client cannot inject
      // a true value to bypass the gate.
      expect(Object.keys(visibilityLinkInitiateSchema.shape)).not.toContain(
        'managedTierActive',
      );
    });
  },
);
