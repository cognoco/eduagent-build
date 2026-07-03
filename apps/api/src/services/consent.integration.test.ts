/**
 * Integration: createGrantedConsentState atomicity [BUG-863]
 *
 * Proves rollback against a real database. The consent + family_link writes
 * happen inside `db.transaction(...)`; if the family_link insert fails the
 * FK constraint, BOTH writes must roll back so the child profile is never
 * left in CONSENTED state without a parent link (GDPR/COPPA exposure).
 *
 * Unit tests in consent.test.ts already verify the call shape (single
 * transaction call, error propagates). This test verifies the runtime
 * behaviour against Postgres — the silent neon-http non-atomic fallback
 * was the actual root cause, and only an end-to-end check confirms the
 * driver migration restored ACID semantics.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  consentStates,
  familyLinks,
  nudges,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import { isIdentityV2Enabled } from '../../../../tests/integration/helpers';

import {
  createGrantedConsentState,
  revokeConsent,
  requestConsent,
  resendConsent,
  ConsentResendLimitError,
  ConsentRecipientChangeLimitError,
  ConsentRequestNotFoundError,
} from './consent';

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

const PREFIX = 'integration-consent-863';
const TEST_EMAIL = `${PREFIX}@integration.test`;
const TEST_CLERK = `${PREFIX}-clerk`;
// A UUID that is NEVER seeded — used to trigger the FK violation on
// familyLinks.parent_profile_id and force the transaction to roll back.
const NON_EXISTENT_PARENT_ID = '00000000-0000-0000-0000-000000000000';

async function cleanup() {
  const db = createIntegrationDb();
  const accs = await db.query.accounts.findMany({
    where: inArray(accounts.email, [TEST_EMAIL]),
  });
  if (accs.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        accs.map((a: typeof accounts.$inferSelect) => a.id),
      ),
    );
  }
}

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// WI-1128 quarantine: exercises services/consent.ts, whose DB layer is orphaned dead code (§7.3-confirmed; all DB exports have live V2 twins in services/identity-v2/consent-v2.ts, createGrantedConsentState reachable only via dead createProfile*). Fails post-0130 because consent.ts reads legacy tables WI-1128 drops. consent.ts deletion + un-skipping these tests are WI-1139 dead-sweep scope.
(isIdentityV2Enabled() ? describe.skip : describe)(
  'createGrantedConsentState atomicity (integration) [BUG-863]',
  () => {
    it('rolls back the consent_states row when the family_link FK insert fails', async () => {
      const db = createIntegrationDb();
      const [account] = await db
        .insert(accounts)
        .values({ clerkUserId: TEST_CLERK, email: TEST_EMAIL })
        .returning();
      const [child] = await db
        .insert(profiles)
        .values({
          accountId: account!.id,
          displayName: 'Test Child',
          birthYear: 2014,
          isOwner: false,
        })
        .returning();

      // Trigger an FK violation on familyLinks.parent_profile_id mid-transaction.
      // The consent insert succeeds first, then the family_link insert fails —
      // a non-atomic execution would leave the consent row behind.
      await expect(
        createGrantedConsentState(
          db,
          child!.id,
          'GDPR',
          NON_EXISTENT_PARENT_ID,
        ),
      ).rejects.toThrow();

      // Verify rollback: NO consent_states row exists for this profile. If the
      // transaction was non-atomic, the insert would have already committed
      // before the family_link error and this query would return a row.
      const lingering = await db.query.consentStates.findMany({
        where: eq(consentStates.profileId, child!.id),
      });
      expect(lingering).toHaveLength(0);

      // And no orphan family_link row either.
      const links = await db.query.familyLinks.findMany({
        where: eq(familyLinks.childProfileId, child!.id),
      });
      expect(links).toHaveLength(0);
    });

    it('persists both rows when both inserts succeed', async () => {
      const db = createIntegrationDb();
      const [account] = await db
        .insert(accounts)
        .values({ clerkUserId: TEST_CLERK, email: TEST_EMAIL })
        .returning();
      const [parent] = await db
        .insert(profiles)
        .values({
          accountId: account!.id,
          displayName: 'Parent',
          birthYear: 1985,
          isOwner: true,
        })
        .returning();
      const [child] = await db
        .insert(profiles)
        .values({
          accountId: account!.id,
          displayName: 'Child',
          birthYear: 2014,
          isOwner: false,
        })
        .returning();

      const result = await createGrantedConsentState(
        db,
        child!.id,
        'GDPR',
        parent!.id,
      );
      expect(result.status).toBe('CONSENTED');

      const consents = await db.query.consentStates.findMany({
        where: eq(consentStates.profileId, child!.id),
      });
      expect(consents).toHaveLength(1);
      expect(consents[0]!.status).toBe('CONSENTED');

      const links = await db.query.familyLinks.findMany({
        where: eq(familyLinks.childProfileId, child!.id),
      });
      expect(links).toHaveLength(1);
      expect(links[0]!.parentProfileId).toBe(parent!.id);
    });
  },
);

// ---------------------------------------------------------------------------
// revokeConsent — nudge-suppression branch (integration)
// ---------------------------------------------------------------------------
//
// These tests verify the transactional nudge-suppression behaviour introduced
// alongside the WITHDRAWN update. They exercise the real Postgres DB so that
// the atomicity guarantee is proven at runtime, not just at the mock level.
// ---------------------------------------------------------------------------

const REVOKE_PREFIX = 'integration-consent-revoke';
const REVOKE_EMAIL_A = `${REVOKE_PREFIX}-a@integration.test`;
const REVOKE_EMAIL_B = `${REVOKE_PREFIX}-b@integration.test`;
const REVOKE_CLERK_A = `${REVOKE_PREFIX}-clerk-a`;
const REVOKE_CLERK_B = `${REVOKE_PREFIX}-clerk-b`;

async function cleanupRevokeTests() {
  const db = createIntegrationDb();
  const accs = await db.query.accounts.findMany({
    where: inArray(accounts.email, [REVOKE_EMAIL_A, REVOKE_EMAIL_B]),
  });
  if (accs.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        accs.map((a: typeof accounts.$inferSelect) => a.id),
      ),
    );
  }
}

/**
 * Seeds a parent + child profile with a CONSENTED consent state, a
 * family_link, and N unread nudges sent from the parent to the child.
 * Returns the created IDs so callers can query them after revokeConsent.
 */
async function seedConsentedChildWithNudges(
  db: ReturnType<typeof createIntegrationDb>,
  {
    accountEmail,
    clerkUserId,
    nudgeCount,
  }: { accountEmail: string; clerkUserId: string; nudgeCount: number },
) {
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email: accountEmail })
    .returning();

  const [parent] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Parent',
      birthYear: 1985,
      isOwner: true,
    })
    .returning();

  const [child] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Child',
      birthYear: 2014,
      isOwner: false,
    })
    .returning();

  const [consent] = await db
    .insert(consentStates)
    .values({
      profileId: child!.id,
      consentType: 'GDPR',
      status: 'CONSENTED',
      respondedAt: new Date(),
    })
    .returning();

  await db.insert(familyLinks).values({
    childProfileId: child!.id,
    parentProfileId: parent!.id,
  });

  const nudgeIds: string[] = [];
  for (let i = 0; i < nudgeCount; i++) {
    const [nudge] = await db
      .insert(nudges)
      .values({
        fromProfileId: parent!.id,
        toProfileId: child!.id,
        template: 'you_got_this',
      })
      .returning();
    nudgeIds.push(nudge!.id);
  }

  return {
    parentId: parent!.id,
    childId: child!.id,
    consentId: consent!.id,
    nudgeIds,
  };
}

(isIdentityV2Enabled() ? describe.skip : describe)(
  'revokeConsent nudge-suppression (integration)',
  () => {
    beforeEach(async () => {
      await cleanupRevokeTests();
    });

    afterAll(async () => {
      await cleanupRevokeTests();
    });

    it('[nudge-suppression] marks all unread nudges readAt when consent is revoked', async () => {
      const db = createIntegrationDb();
      const { parentId, childId, nudgeIds } =
        await seedConsentedChildWithNudges(db, {
          accountEmail: REVOKE_EMAIL_A,
          clerkUserId: REVOKE_CLERK_A,
          nudgeCount: 3,
        });

      const result = await revokeConsent(db, childId, parentId);

      expect(result.status).toBe('WITHDRAWN');
      expect(result.respondedAt).not.toBeNull();

      const rows = await db.query.nudges.findMany({
        where: eq(nudges.toProfileId, childId),
      });
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.readAt).not.toBeNull();
      }

      const respondedAt = new Date(result.respondedAt!);
      for (const nudgeId of nudgeIds) {
        const nudge = rows.find(
          (r: typeof nudges.$inferSelect) => r.id === nudgeId,
        );
        expect(nudge).toBeDefined();
        expect(
          Math.abs(nudge!.readAt!.getTime() - respondedAt.getTime()),
        ).toBeLessThan(1000);
      }
    });

    it('[nudge-suppression] second revokeConsent call does NOT update already-read nudges', async () => {
      const db = createIntegrationDb();
      const { parentId, childId } = await seedConsentedChildWithNudges(db, {
        accountEmail: REVOKE_EMAIL_A,
        clerkUserId: REVOKE_CLERK_A,
        nudgeCount: 2,
      });

      await revokeConsent(db, childId, parentId);

      const afterFirst = await db.query.nudges.findMany({
        where: eq(nudges.toProfileId, childId),
      });
      const firstReadAts = afterFirst.map((r: typeof nudges.$inferSelect) =>
        r.readAt!.getTime(),
      );

      await revokeConsent(db, childId, parentId);

      const afterSecond = await db.query.nudges.findMany({
        where: eq(nudges.toProfileId, childId),
      });
      const secondReadAts = afterSecond.map((r: typeof nudges.$inferSelect) =>
        r.readAt!.getTime(),
      );

      expect(secondReadAts).toEqual(firstReadAts);
    });

    it('[nudge-suppression] only marks the targeted child nudges read — sibling nudges stay unread', async () => {
      const db = createIntegrationDb();

      const { parentId: parentA, childId: childA } =
        await seedConsentedChildWithNudges(db, {
          accountEmail: REVOKE_EMAIL_A,
          clerkUserId: REVOKE_CLERK_A,
          nudgeCount: 2,
        });

      const { childId: childB } = await seedConsentedChildWithNudges(db, {
        accountEmail: REVOKE_EMAIL_B,
        clerkUserId: REVOKE_CLERK_B,
        nudgeCount: 2,
      });

      await revokeConsent(db, childA, parentA);

      const nudgesA = await db.query.nudges.findMany({
        where: eq(nudges.toProfileId, childA),
      });
      for (const row of nudgesA) {
        expect(row.readAt).not.toBeNull();
      }

      const nudgesB = await db.query.nudges.findMany({
        where: eq(nudges.toProfileId, childB),
      });
      expect(nudgesB.length).toBeGreaterThan(0);
      for (const row of nudgesB) {
        expect(row.readAt).toBeNull();
      }
    });

    it('[nudge-suppression] does NOT touch nudges when status is already WITHDRAWN (early-return guard)', async () => {
      const db = createIntegrationDb();
      const { parentId, childId } = await seedConsentedChildWithNudges(db, {
        accountEmail: REVOKE_EMAIL_A,
        clerkUserId: REVOKE_CLERK_A,
        nudgeCount: 1,
      });

      await db
        .update(consentStates)
        .set({ status: 'WITHDRAWN', respondedAt: new Date() })
        .where(eq(consentStates.profileId, childId));

      const before = await db.query.nudges.findMany({
        where: eq(nudges.toProfileId, childId),
      });
      expect(before[0]!.readAt).toBeNull();

      const result = await revokeConsent(db, childId, parentId);
      expect(result.status).toBe('WITHDRAWN');

      const after = await db.query.nudges.findMany({
        where: eq(nudges.toProfileId, childId),
      });
      expect(after[0]!.readAt).toBeNull();
    });
  },
);

// ---------------------------------------------------------------------------
// [WI-374] Resend/recipient-change caps are request-keyed (integration)
// ---------------------------------------------------------------------------
//
// The security break test for WI-374. Proves against a real Postgres that:
//   1. Resend is capped per request (MAX_CONSENT_RESENDS) and reuses the
//      stored email — the stored recipient never changes on resend.
//   2. Rotating the recipient is SEPARATELY capped (MAX_RECIPIENT_CHANGES), so
//      an abuser can no longer reset the resend cap indefinitely by rotating
//      the recipient string (the pre-fix behaviour: changing the email reset
//      resendCount to 0 with no cap on changes → unbounded consent-email
//      bombing of arbitrary addresses).
//
// Email delivery is intentionally NOT exercised: calling requestConsent /
// resendConsent WITHOUT emailOptions makes sendEmail return `no_api_key`,
// which returns early WITHOUT rolling back the counter — so the cap logic is
// driven purely by DB state and no external Resend call is made.
// ---------------------------------------------------------------------------

const WI374_PREFIX = 'integration-consent-wi374';
const WI374_EMAIL = `${WI374_PREFIX}@integration.test`;
const WI374_CLERK = `${WI374_PREFIX}-clerk`;
const APP_URL = 'https://api.integration.test';

async function cleanupWi374() {
  const db = createIntegrationDb();
  const accs = await db.query.accounts.findMany({
    where: inArray(accounts.email, [WI374_EMAIL]),
  });
  if (accs.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        accs.map((a: typeof accounts.$inferSelect) => a.id),
      ),
    );
  }
}

(isIdentityV2Enabled() ? describe.skip : describe)(
  '[WI-374] request-keyed resend + capped recipient change (integration)',
  () => {
    beforeEach(cleanupWi374);
    afterAll(cleanupWi374);

    async function seedChild(db: ReturnType<typeof createIntegrationDb>) {
      const [account] = await db
        .insert(accounts)
        .values({ clerkUserId: WI374_CLERK, email: WI374_EMAIL })
        .returning();
      const [child] = await db
        .insert(profiles)
        .values({
          accountId: account!.id,
          displayName: 'WI374 Child',
          birthYear: 2014,
          isOwner: false,
        })
        .returning();
      return child!.id;
    }

    it('resend is capped per request and reuses the stored email (never changes the recipient)', async () => {
      const db = createIntegrationDb();
      const childId = await seedChild(db);

      // Initial request (no emailOptions → no_api_key, row persists).
      await requestConsent(
        db,
        {
          childProfileId: childId,
          parentEmail: 'real-parent@example.com',
          consentType: 'GDPR',
        },
        APP_URL,
      );

      // MAX_CONSENT_RESENDS (3) resends succeed; each reuses the stored email.
      for (let i = 0; i < 3; i++) {
        await resendConsent(
          db,
          { childProfileId: childId, consentType: 'GDPR' },
          APP_URL,
        );
      }

      // The 4th resend exceeds the cap.
      await expect(
        resendConsent(
          db,
          { childProfileId: childId, consentType: 'GDPR' },
          APP_URL,
        ),
      ).rejects.toBeInstanceOf(ConsentResendLimitError);

      // Stored recipient is unchanged and the counter is pinned at the cap.
      const row = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, childId),
      });
      expect(row!.parentEmail).toBe('real-parent@example.com');
      expect(row!.resendCount).toBe(3);
      expect(row!.recipientChangeCount).toBe(0);
    });

    it('[BREAK] rotating the recipient is bounded by MAX_RECIPIENT_CHANGES — rotation cannot reset the resend cap indefinitely', async () => {
      const db = createIntegrationDb();
      const childId = await seedChild(db);

      // Initial request to recipient A.
      await requestConsent(
        db,
        {
          childProfileId: childId,
          parentEmail: 'a@example.com',
          consentType: 'GDPR',
        },
        APP_URL,
      );

      // Three legitimate recipient changes succeed (A→B→C→D). Each resets the
      // resend budget but consumes one of the MAX_RECIPIENT_CHANGES (3) slots.
      for (const email of ['b@example.com', 'c@example.com', 'd@example.com']) {
        await requestConsent(
          db,
          { childProfileId: childId, parentEmail: email, consentType: 'GDPR' },
          APP_URL,
        );
      }

      // The 4th rotation is rejected — pre-fix this would have reset the resend
      // cap again (unbounded). Now it is capped.
      await expect(
        requestConsent(
          db,
          {
            childProfileId: childId,
            parentEmail: 'e@example.com',
            consentType: 'GDPR',
          },
          APP_URL,
        ),
      ).rejects.toBeInstanceOf(ConsentRecipientChangeLimitError);

      const row = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, childId),
      });
      // Recipient stuck at the last accepted change (D); E was rejected.
      expect(row!.parentEmail).toBe('d@example.com');
      expect(row!.recipientChangeCount).toBe(3);
    });

    it('[CodeRabbit break] a resend does NOT revive a terminal CONSENTED row (no consent-state corruption)', async () => {
      const db = createIntegrationDb();
      const childId = await seedChild(db);

      // Seed an already-decided (CONSENTED) consent with budget remaining.
      await db.insert(consentStates).values({
        profileId: childId,
        consentType: 'GDPR',
        status: 'CONSENTED',
        parentEmail: 'granted@example.com',
        respondedAt: new Date(),
        resendCount: 0,
      });

      // A resend must NOT flip it back to PARENTAL_CONSENT_REQUESTED.
      await expect(
        resendConsent(
          db,
          { childProfileId: childId, consentType: 'GDPR' },
          APP_URL,
        ),
      ).rejects.toBeInstanceOf(ConsentRequestNotFoundError);

      const row = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, childId),
      });
      expect(row!.status).toBe('CONSENTED');
      expect(row!.resendCount).toBe(0);
    });

    it('[BUG-791 break] requestConsent CANNOT revive a terminal CONSENTED row with a null parentEmail', async () => {
      const db = createIntegrationDb();
      const childId = await seedChild(db);

      // A parent-created child profile: the consent row is CONSENTED inline with
      // NO parentEmail on record (createGrantedConsentState clears parentEmail to
      // null). Pre-fix, the request upsert matched the `parentEmail IS NULL`
      // branch in setWhere and flipped this decided consent back to
      // PARENTAL_CONSENT_REQUESTED — letting a same-account sibling disrupt the
      // consent state and re-email an arbitrary address.
      await db.insert(consentStates).values({
        profileId: childId,
        consentType: 'GDPR',
        status: 'CONSENTED',
        parentEmail: null,
        respondedAt: new Date(),
        resendCount: 0,
        recipientChangeCount: 0,
      });

      await expect(
        requestConsent(
          db,
          {
            childProfileId: childId,
            parentEmail: 'attacker@example.com',
            consentType: 'GDPR',
          },
          APP_URL,
        ),
      ).rejects.toBeInstanceOf(ConsentRequestNotFoundError);

      // The decided consent is untouched: status stays CONSENTED and the
      // attacker-supplied recipient was never written.
      const row = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, childId),
      });
      expect(row!.status).toBe('CONSENTED');
      expect(row!.parentEmail).toBeNull();
    });

    it('[BUG-791 break] requestConsent CANNOT revive a terminal WITHDRAWN row', async () => {
      const db = createIntegrationDb();
      const childId = await seedChild(db);

      await db.insert(consentStates).values({
        profileId: childId,
        consentType: 'GDPR',
        status: 'WITHDRAWN',
        parentEmail: 'former-parent@example.com',
        respondedAt: new Date(),
        resendCount: 0,
        recipientChangeCount: 0,
      });

      await expect(
        requestConsent(
          db,
          {
            childProfileId: childId,
            parentEmail: 'attacker@example.com',
            consentType: 'GDPR',
          },
          APP_URL,
        ),
      ).rejects.toBeInstanceOf(ConsentRequestNotFoundError);

      const row = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, childId),
      });
      expect(row!.status).toBe('WITHDRAWN');
      expect(row!.parentEmail).toBe('former-parent@example.com');
    });

    it('the first real email after a PENDING (null-recipient) row is the initial request, not a recipient change', async () => {
      const db = createIntegrationDb();
      const childId = await seedChild(db);

      // Self-register flow seeds a PENDING row with no recipient yet.
      await db.insert(consentStates).values({
        profileId: childId,
        consentType: 'GDPR',
        status: 'PENDING',
      });

      // First real send assigns the recipient — must NOT burn a change slot.
      await requestConsent(
        db,
        {
          childProfileId: childId,
          parentEmail: 'first@example.com',
          consentType: 'GDPR',
        },
        APP_URL,
      );

      const row = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, childId),
      });
      expect(row!.parentEmail).toBe('first@example.com');
      expect(row!.recipientChangeCount).toBe(0);

      // The full MAX_RECIPIENT_CHANGES budget (3) is still available afterwards.
      for (const email of ['b@example.com', 'c@example.com', 'd@example.com']) {
        await requestConsent(
          db,
          { childProfileId: childId, parentEmail: email, consentType: 'GDPR' },
          APP_URL,
        );
      }
      await expect(
        requestConsent(
          db,
          {
            childProfileId: childId,
            parentEmail: 'e@example.com',
            consentType: 'GDPR',
          },
          APP_URL,
        ),
      ).rejects.toBeInstanceOf(ConsentRecipientChangeLimitError);
    });

    it('a single legitimate "wrong email" correction still works (AC3)', async () => {
      const db = createIntegrationDb();
      const childId = await seedChild(db);

      await requestConsent(
        db,
        {
          childProfileId: childId,
          parentEmail: 'typo@example.com',
          consentType: 'GDPR',
        },
        APP_URL,
      );

      // Correct the typo once — allowed, and the corrected address gets a fresh
      // resend budget.
      await requestConsent(
        db,
        {
          childProfileId: childId,
          parentEmail: 'correct@example.com',
          consentType: 'GDPR',
        },
        APP_URL,
      );

      const row = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, childId),
      });
      expect(row!.parentEmail).toBe('correct@example.com');
      expect(row!.recipientChangeCount).toBe(1);
      expect(row!.resendCount).toBe(0);

      // And the corrected address can still be resent to.
      await resendConsent(
        db,
        { childProfileId: childId, consentType: 'GDPR' },
        APP_URL,
      );
      const after = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, childId),
      });
      expect(after!.parentEmail).toBe('correct@example.com');
      expect(after!.resendCount).toBe(1);
    });
  },
);
