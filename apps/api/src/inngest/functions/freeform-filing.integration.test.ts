// ---------------------------------------------------------------------------
// [WI-809] Freeform Filing Retry — GDPR consent gate, identity-v2 flag routing.
//
// Integration (real DB, no internal mocks): proves the cutover fix at
// freeform-filing.ts:75. flag-on routes the GDPR gate through
// isGdprProcessingAllowedV2 (reads consent_grant); the legacy
// isGdprProcessingAllowed (reads the dropped consent_states table) is only
// reached flag-off. The load-bearing red-green case (flag-on + WITHDRAWN GDPR
// grant → blocked) seeds NO consent_states row, so it is valid regardless of
// whether migration 0118 (M-DROP) has been applied to the staging DB:
//   - with the fix: v2 reads consent_grant → WITHDRAWN → blocked (skipped).
//   - reverted: legacy reads consent_states → empty → allowed (proceeds) if the
//     table exists, or throws if it is dropped — either way ≠ skipped → RED.
// The consent gate resolves the org through `membership`, so every flag-on case
// seeds a membership row (person.id = profileId); omitting it would short-
// circuit isGdprProcessingAllowedV2 to the degenerate no-membership → allowed.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  membership,
  organization,
  person,
  subjects,
  type Database,
} from '@eduagent/database';

import { freeformFilingRetry } from './freeform-filing';
import { setIdentityV2Enabled } from '../helpers';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
// [WI-809] v2-only seed (no legacy accounts/profiles), so this suite can only run
// on a POST-M-DROP DB where the subjects/learning_sessions FK→profiles has been
// dropped. On a pre-drop DB (current CI integration branch — 0117/0118 are
// de-journaled/freeze-only) the inserts would FK-violate. Gate on
// IDENTITY_POST_DROP=1 so it runs only against a post-drop DB; it auto-activates
// on CI once M-DROP lands. Proven green on the post-drop staging DB during WI-809.
const RUN =
  !!process.env['DATABASE_URL'] && process.env['IDENTITY_POST_DROP'] === '1';

const PURPOSE = 'platform_use';
const GDPR = 'gdpr_parental_consent';

(RUN ? describe : describe.skip)(
  '[WI-809] freeformFilingRetry GDPR consent gate (integration)',
  () => {
    let db: Database;
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env['DATABASE_URL']!);
    });

    afterAll(async () => {
      // [WI-809] v2-only teardown (no legacy accounts). consent_grant is RESTRICT
      // → deleted first; then the profileId-keyed learning rows; then membership;
      // then person + organization. FK-safe order.
      for (const oid of orgIds) {
        const pid = profileToPerson[oid] ?? '';
        await db
          .delete(consentGrant)
          .where(eq(consentGrant.organizationId, oid));
        await db
          .delete(learningSessions)
          .where(eq(learningSessions.profileId, pid));
        await db.delete(subjects).where(eq(subjects.profileId, pid));
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(person).where(eq(person.id, pid));
        await db.delete(organization).where(eq(organization.id, oid));
      }
    }, 30_000);

    // org → the person.id (= profileId) anchored to it, for teardown ordering.
    const profileToPerson: Record<string, string> = {};

    afterEach(() => {
      setIdentityV2Enabled(undefined);
    });

    /**
     * [WI-809] v2-only seed (no legacy accounts/profiles — they are dropped at
     * the cutover). person.id = profileId (identity unification); the v2 consent
     * gate resolves the org via membership.personId = profileId. subjects +
     * learningSessions are profileId-keyed learning tables (untouched by the
     * M-DROP) that freeformFilingRetry's check-already-filed step needs.
     */
    async function seedChain(): Promise<{ profileId: string; orgId: string }> {
      const profileId = generateUUIDv7();
      await db.insert(person).values({
        id: profileId,
        displayName: 'Test Child',
        birthDate: '2015-01-01',
        residenceJurisdiction: 'EU',
      });
      const [org] = await db
        .insert(organization)
        .values({ name: 'Org' })
        .returning({ id: organization.id });
      await db.insert(membership).values({
        personId: profileId,
        organizationId: org!.id,
        roles: ['learner'],
      });

      const [subject] = await db
        .insert(subjects)
        .values({ profileId, name: 'Test Subject' })
        .returning({ id: subjects.id });
      const [session] = await db
        .insert(learningSessions)
        .values({
          profileId,
          subjectId: subject!.id,
          sessionType: 'learning',
          status: 'completed',
          // filedAt defaults null → not already filed → reaches the gate.
        })
        .returning({ id: learningSessions.id });
      // Wire the retry event to this session below via createEvent(session.id).
      sessionByProfile[profileId] = session!.id;

      orgIds.push(org!.id);
      profileToPerson[org!.id] = profileId;
      return { profileId, orgId: org!.id };
    }

    const sessionByProfile: Record<string, string> = {};

    function createEvent(profileId: string) {
      return {
        data: {
          profileId,
          sessionId: sessionByProfile[profileId]!,
          sessionMode: 'freeform' as const,
        },
      };
    }

    /**
     * A step harness that runs the real step.run body for every step EXCEPT
     * `retry-filing`, which is overridden to a sentinel so the test does not
     * need transcript/LLM seeding. Reaching the sentinel proves the consent
     * gate was cleared; a `skipped/consent_not_granted` return proves it blocked.
     */
    const RETRY_SENTINEL = {
      status: 'filed' as const,
      filingResult: {
        bookId: 'sentinel-book',
        topicTitle: 'sentinel-topic',
        topicId: 'sentinel-topic-id',
      },
    };
    function buildStep() {
      return {
        run: async (id: string, fn: () => Promise<unknown>) => {
          if (id === 'retry-filing') return RETRY_SENTINEL;
          return fn();
        },
        sendEvent: async () => undefined,
      };
    }

    type Handler = (ctx: unknown) => Promise<unknown>;
    const handler = (freeformFilingRetry as unknown as { fn: Handler }).fn;

    it('flag-on + WITHDRAWN GDPR grant → blocked (consent_not_granted)', async () => {
      const { profileId, orgId } = await seedChain();
      await db.insert(consentGrant).values({
        chargePersonId: profileId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(),
        withdrawnAt: new Date(),
      });
      setIdentityV2Enabled('true');

      const result = await handler({
        event: createEvent(profileId),
        step: buildStep(),
      });

      expect(result).toEqual({
        status: 'skipped',
        reason: 'consent_not_granted',
      });
    });

    it('flag-on + CONSENTED GDPR grant → allowed (clears the gate)', async () => {
      const { profileId, orgId } = await seedChain();
      await db.insert(consentGrant).values({
        chargePersonId: profileId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(),
      });
      setIdentityV2Enabled('true');

      const result = (await handler({
        event: createEvent(profileId),
        step: buildStep(),
      })) as { status: string };

      // Cleared the gate → proceeded into retry-filing (sentinel) → completed.
      expect(result.status).toBe('completed');
    });

    it('flag-on + no GDPR consent row → allowed (legacy "no row → allowed")', async () => {
      const { profileId } = await seedChain();
      // No consent_grant seeded; membership present so v2 resolves null → allowed.
      setIdentityV2Enabled('true');

      const result = (await handler({
        event: createEvent(profileId),
        step: buildStep(),
      })) as { status: string };

      expect(result.status).toBe('completed');
    });

    // NOTE: the flag-off path is the verbatim original isGdprProcessingAllowed(db,
    // profileId) call — "unchanged" is provable from the diff and is exercised by
    // the pre-existing freeform-filing unit tests. A runtime flag-off case is
    // omitted here because it would seed the dropped legacy consent_states table,
    // which does not exist on the post-M-DROP DB this v2 suite runs against.
  },
);
