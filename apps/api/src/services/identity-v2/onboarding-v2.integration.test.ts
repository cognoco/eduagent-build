// ---------------------------------------------------------------------------
// WI-867 — real-execution coverage for updateConversationLanguageV2 /
// updatePronounsV2 (services/identity-v2/onboarding-v2.ts).
//
// These fns use db.update(person) with an atomic correlated EXISTS guard —
// they cannot run against a unit mock DB. This suite covers:
//   - updateConversationLanguageV2: person in org → column updated + returns true
//   - updateConversationLanguageV2: person NOT a member → returns false + no mutation
//   - updatePronounsV2: person in org → column updated + returns true
//   - updatePronounsV2: person in org, pronouns=null → clears to null + returns true
//   - updatePronounsV2: person NOT a member → returns false + no mutation
//
// Seeding: organization + person + membership (membership omitted for negative
// cases). No legacy account/profile twin needed — these fns touch only person.
//
// Pattern: (RUN ? describe : describe.skip) — skips silently when DATABASE_URL
// is absent (unit/local runs without a DB).
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import {
  updateConversationLanguageV2,
  updatePronounsV2,
} from './onboarding-v2';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'onboarding-v2 — updateConversationLanguageV2 / updatePronounsV2 (WI-867)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      // membership has RESTRICT FK on person; delete membership before person.
      for (const pid of personIds) {
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      for (const oid of orgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      personIds.length = 0;
      orgIds.length = 0;
    });

    const RUN_ID = generateUUIDv7();

    async function seedOrg(): Promise<string> {
      const [org] = await db
        .insert(organization)
        .values({ name: `WI-867-onb-org-${RUN_ID}` })
        .returning();
      orgIds.push(org!.id);
      return org!.id;
    }

    /** Inserts a person and, when `orgId` is non-null, a membership row. */
    async function seedPerson(orgId: string | null): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({
          displayName: 'OnbTestPerson',
          birthDate: '1990-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(p!.id);
      if (orgId !== null) {
        await db.insert(membership).values({
          personId: p!.id,
          organizationId: orgId,
          roles: ['learner'],
        });
      }
      return p!.id;
    }

    // -------------------------------------------------------------------------
    // updateConversationLanguageV2
    // -------------------------------------------------------------------------
    describe('updateConversationLanguageV2', () => {
      it('updates conversation_language and returns true when person is a member', async () => {
        const orgId = await seedOrg();
        const profileId = await seedPerson(orgId);

        const result = await updateConversationLanguageV2(
          db,
          profileId,
          orgId,
          'de',
        );

        expect(result).toBe(true);
        const [row] = await db
          .select({ conversationLanguage: person.conversationLanguage })
          .from(person)
          .where(eq(person.id, profileId));
        expect(row?.conversationLanguage).toBe('de');
      });

      it('returns false and does not mutate when person is not a member of the org', async () => {
        const orgId = await seedOrg();
        const profileId = await seedPerson(null); // no membership row

        const result = await updateConversationLanguageV2(
          db,
          profileId,
          orgId,
          'de',
        );

        expect(result).toBe(false);
        const [row] = await db
          .select({ conversationLanguage: person.conversationLanguage })
          .from(person)
          .where(eq(person.id, profileId));
        expect(row?.conversationLanguage).not.toBe('de');
      });
    });

    // -------------------------------------------------------------------------
    // updatePronounsV2
    // -------------------------------------------------------------------------
    describe('updatePronounsV2', () => {
      it('updates pronouns and returns true when person is a member', async () => {
        const orgId = await seedOrg();
        const profileId = await seedPerson(orgId);

        const result = await updatePronounsV2(
          db,
          profileId,
          orgId,
          'they/them',
        );

        expect(result).toBe(true);
        const [row] = await db
          .select({ pronouns: person.pronouns })
          .from(person)
          .where(eq(person.id, profileId));
        expect(row?.pronouns).toBe('they/them');
      });

      it('clears pronouns to null and returns true when pronouns=null', async () => {
        const orgId = await seedOrg();
        const profileId = await seedPerson(orgId);
        // Prime with a non-null value first.
        await updatePronounsV2(db, profileId, orgId, 'she/her');

        const result = await updatePronounsV2(db, profileId, orgId, null);

        expect(result).toBe(true);
        const [row] = await db
          .select({ pronouns: person.pronouns })
          .from(person)
          .where(eq(person.id, profileId));
        expect(row?.pronouns).toBeNull();
      });

      it('returns false and does not mutate when person is not a member of the org', async () => {
        const orgId = await seedOrg();
        const profileId = await seedPerson(null); // no membership row

        const result = await updatePronounsV2(
          db,
          profileId,
          orgId,
          'they/them',
        );

        expect(result).toBe(false);
        const [row] = await db
          .select({ pronouns: person.pronouns })
          .from(person)
          .where(eq(person.id, profileId));
        expect(row?.pronouns).not.toBe('they/them');
      });
    });
  },
);
