/**
 * Break-test T7a — kid-initiated revocation auth guard.
 * (S5 visibility-contract plan, `## Tests` → T7a.)
 *
 * Only the SUPPORTEE (the kid the link is about) may end a support link. A
 * supporter must not be able to self-unlink a link they hold over someone else.
 * The guard is `requestSelfUnlink` (`supportership-revocation.ts:45-47`):
 *
 *   if (row.edge.supporteePersonId !== input.callerPersonId)
 *     throw new ForbiddenError('Only the supportee can end this support link.');
 *
 * Reverting that branch lets a supporter revoke a kid's link → red.
 *
 * Caller identity is never trusted from a request body; the route passes the
 * authenticated `callerPersonId` (`routes/visibility.ts:107-110`). This test
 * drives the service directly with a real Neon DB — no internal mocks.
 *
 * NOTE: the test deliberately asserts ONLY the forbidden path. The happy-path
 * notice write in `requestSelfUnlink` has an independent payload-shape drift
 * (writes `graceEndsAt`; `supportLinkEndedPayloadSchema` wants `graceDays`) that
 * is out of scope for this WI; the auth guard short-circuits before it.
 *
 * Also pins the PII-egress shape: `supportershipUnlinkedEventSchema` carries
 * opaque ids + a timestamp only. zod strips (does not reject) unknown keys, so a
 * smuggled display name never reaches Inngest's third-party event store.
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
import { supportershipUnlinkedEventSchema } from '@eduagent/schemas';

import { ForbiddenError } from '../errors';
import { requestSelfUnlink } from './supportership-revocation';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

const NOW = new Date('2026-06-29T12:00:00.000Z');

function createIntegrationDb(): Database {
  return createDatabase(process.env.DATABASE_URL!);
}

(RUN ? describe : describe.skip)(
  'requestSelfUnlink auth guard (integration) [T7a]',
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

    async function seedAcceptedSupportLink(): Promise<{
      supporterId: string;
      supporteeId: string;
      supportershipId: string;
    }> {
      const [supporter] = await db
        .insert(person)
        .values({
          displayName: 'T7a Supporter',
          birthDate: '1990-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      const [supportee] = await db
        .insert(person)
        .values({
          displayName: 'T7a Supportee',
          birthDate: '2014-01-01',
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

      await db.insert(supportVisibilityContracts).values({
        supportershipId: edge!.id,
        supporterPersonId: supporter!.id,
        supporteePersonId: supportee!.id,
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
      });

      return {
        supporterId: supporter!.id,
        supporteeId: supportee!.id,
        supportershipId: edge!.id,
      };
    }

    it('forbids a SUPPORTER from ending the link and leaves the edge intact', async () => {
      const seeded = await seedAcceptedSupportLink();

      await expect(
        requestSelfUnlink(db, {
          supportershipId: seeded.supportershipId,
          callerPersonId: seeded.supporterId, // supporter, NOT supportee
          now: NOW,
        }),
      ).rejects.toThrow(ForbiddenError);

      const edge = await db.query.supportership.findFirst({
        where: eq(supportership.id, seeded.supportershipId),
      });
      expect(edge!.revokedAt).toBeNull();
    });

    it('does not serialize a smuggled display name into the unlink event (PII egress)', () => {
      const parsed = supportershipUnlinkedEventSchema.parse({
        supportershipId: '11111111-1111-4111-8111-111111111111',
        supporteePersonId: '22222222-2222-4222-9222-222222222222',
        supporterPersonId: '33333333-3333-4333-a333-333333333333',
        revokedAt: NOW.toISOString(),
        // Attempt to smuggle a display name through the event boundary.
        displayName: 'Mia Q.',
      });

      expect(parsed).not.toHaveProperty('displayName');
      expect(Object.keys(parsed).sort()).toEqual([
        'revokedAt',
        'supporteePersonId',
        'supporterPersonId',
        'supportershipId',
      ]);
    });
  },
);
