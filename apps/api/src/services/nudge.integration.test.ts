/**
 * Integration: nudge service — real database (I1 atomicity + I7 coverage)
 *
 * Covers:
 *   1. Happy-path end-to-end insert
 *   2. Rate-limit BREAK test: 5th createNudge from same parent throws RateLimitedError
 *   3. Per-recipient dimension BREAK test: child at limit, parent B also blocked
 *   4. Concurrency BREAK test: count=2, 5 concurrent calls, at most 1 succeeds
 *   5. IDOR BREAK: markNudgeRead with wrong profileId returns 0
 *   6. IDOR BREAK: markAllNudgesRead with wrong profileId returns 0
 *
 * Expo Push API is intercepted at the fetch boundary. All service modules and
 * DB operations run through the real integration path.
 *
 * AGENTS.md rule: no internal jest.mock() in integration tests.
 */

import { resolve } from 'path';

import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import {
  accounts,
  consentGrant,
  consentStates,
  createDatabase,
  familyLinks,
  generateUUIDv7,
  guardianship,
  membership,
  nudges,
  notificationPreferences,
  organization,
  person,
  profiles,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { ConsentRequiredError, RateLimitedError } from '@eduagent/schemas';

import {
  clearFetchCalls,
  getFetchCalls,
  installFetchInterceptor,
  restoreFetch,
} from '../../../../tests/integration/fetch-interceptor';
import { mockExpoPush } from '../../../../tests/integration/external-mocks';
import { createNudge, markNudgeRead, markAllNudgesRead } from './nudge';

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
// [WI-809] The v2 consent-gate suite seeds person ids directly (no legacy
// accounts/profiles), so it can only run on a POST-M-DROP DB where the
// nudges/notification_preferences FK→profiles has been dropped. On a pre-drop DB
// (current CI integration branch — 0117/0118 are de-journaled/freeze-only) those
// inserts would FK-violate. Gate on IDENTITY_POST_DROP=1 so the suite runs only
// against a post-drop DB (e.g. staging post-cutover); it auto-activates on CI
// once M-DROP lands. Proven green on the post-drop staging DB during WI-809.
const describeIfPostDrop =
  hasDatabaseUrl && process.env.IDENTITY_POST_DROP === '1'
    ? describe
    : describe.skip;

const RUN_ID = generateUUIDv7();

let db: Database;

let parentAProfileId: string;
let parentBProfileId: string;
let childXProfileId: string;
let childYProfileId: string;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedNudgeRow(
  fromProfileId: string,
  toProfileId: string,
  createdAt?: Date,
): Promise<string> {
  const [row] = await db
    .insert(nudges)
    .values({
      fromProfileId,
      toProfileId,
      template: 'you_got_this',
      createdAt: createdAt ?? new Date(),
    })
    .returning({ id: nudges.id });
  return row!.id;
}

async function seedConsent(childProfileId: string): Promise<void> {
  await db.insert(consentStates).values({
    profileId: childProfileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
  });
}

async function seedPushToken(profileId: string): Promise<void> {
  await db.insert(notificationPreferences).values({
    profileId,
    pushEnabled: true,
    expoPushToken: `ExponentPushToken[nudge-${RUN_ID}]`,
  });
}

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  await db.insert(familyLinks).values({ parentProfileId, childProfileId });
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

async function cleanup(): Promise<void> {
  await db
    .delete(accounts)
    .where(
      inArray(accounts.clerkUserId, [
        `nudge-integ-${RUN_ID}-parentA`,
        `nudge-integ-${RUN_ID}-parentB`,
        `nudge-integ-${RUN_ID}-child`,
      ]),
    );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describeIfDb('nudge service (integration)', () => {
  beforeAll(async () => {
    installFetchInterceptor();
    mockExpoPush();
    db = createDatabase(process.env.DATABASE_URL!);

    const [accA] = await db
      .insert(accounts)
      .values({
        clerkUserId: `nudge-integ-${RUN_ID}-parentA`,
        email: `nudge-integ-${RUN_ID}-parentA@test.invalid`,
      })
      .returning({ id: accounts.id });

    const [accB] = await db
      .insert(accounts)
      .values({
        clerkUserId: `nudge-integ-${RUN_ID}-parentB`,
        email: `nudge-integ-${RUN_ID}-parentB@test.invalid`,
      })
      .returning({ id: accounts.id });

    const [accChild] = await db
      .insert(accounts)
      .values({
        clerkUserId: `nudge-integ-${RUN_ID}-child`,
        email: `nudge-integ-${RUN_ID}-child@test.invalid`,
      })
      .returning({ id: accounts.id });

    const [parentA] = await db
      .insert(profiles)
      .values({
        accountId: accA!.id,
        displayName: 'Parent A',
        birthYear: 1980,
        isOwner: true,
      })
      .returning({ id: profiles.id });
    parentAProfileId = parentA!.id;

    const [parentB] = await db
      .insert(profiles)
      .values({
        accountId: accB!.id,
        displayName: 'Parent B',
        birthYear: 1982,
        isOwner: true,
      })
      .returning({ id: profiles.id });
    parentBProfileId = parentB!.id;

    const [childX] = await db
      .insert(profiles)
      .values({
        accountId: accChild!.id,
        displayName: 'Child X',
        birthYear: 2013,
        isOwner: false,
      })
      .returning({ id: profiles.id });
    childXProfileId = childX!.id;

    const [childY] = await db
      .insert(profiles)
      .values({
        accountId: accChild!.id,
        displayName: 'Child Y',
        birthYear: 2015,
        isOwner: false,
      })
      .returning({ id: profiles.id });
    childYProfileId = childY!.id;

    await seedFamilyLink(parentAProfileId, childXProfileId);
    await seedFamilyLink(parentBProfileId, childXProfileId);
    await seedFamilyLink(parentAProfileId, childYProfileId);

    await seedConsent(childXProfileId);
    await seedConsent(childYProfileId);
    await seedPushToken(childXProfileId);
  });

  afterAll(async () => {
    await cleanup();
    restoreFetch();
  });

  beforeEach(async () => {
    clearFetchCalls();
    await db
      .delete(nudges)
      .where(inArray(nudges.toProfileId, [childXProfileId, childYProfileId]));
  });

  // ── 1. Happy path ──────────────────────────────────────────────────────────

  it('creates a nudge row end-to-end', async () => {
    // Pass deterministic midday UTC to avoid quiet-hours suppression
    // (QUIET_HOURS_START=21, QUIET_HOURS_END=7 — 14:00 UTC is always outside).
    const midDayUtc = new Date();
    midDayUtc.setUTCHours(14, 0, 0, 0);
    const result = await createNudge(db, {
      fromProfileId: parentAProfileId,
      toProfileId: childXProfileId,
      template: 'you_got_this',
      now: midDayUtc,
    });

    expect(result.nudge.fromProfileId).toBe(parentAProfileId);
    expect(result.nudge.toProfileId).toBe(childXProfileId);
    expect(result.nudge.template).toBe('you_got_this');
    expect(result.nudge.readAt).toBeNull();
    expect(typeof result.nudge.id).toBe('string');
    expect(result.pushSent).toBe(true);

    const rows = await db.query.nudges.findMany({
      where: eq(nudges.id, result.nudge.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fromProfileId).toBe(parentAProfileId);
    expect(getFetchCalls('exp.host/--/api/v2/push/send')).toHaveLength(1);
  });

  // ── 2. Rate-limit BREAK test ───────────────────────────────────────────────

  it('[BREAK] throws RateLimitedError after 4 nudges from same parent to same child', async () => {
    const now = new Date();
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);

    await expect(
      createNudge(db, {
        fromProfileId: parentAProfileId,
        toProfileId: childXProfileId,
        template: 'proud_of_you',
      }),
    ).rejects.toThrow(RateLimitedError);

    const NUDGE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() - NUDGE_WINDOW_MS);
    const count = await db
      .select()
      .from(nudges)
      .where(
        and(
          eq(nudges.fromProfileId, parentAProfileId),
          eq(nudges.toProfileId, childXProfileId),
          gt(nudges.createdAt, windowStart),
        ),
      );
    expect(count).toHaveLength(4);
  });

  // ── 3. Per-recipient dimension (I1 spec: max 4/day per child, any sender) ─

  it('[PARENT-16][BREAK] parent B cannot send when child has received 4 nudges from any parent', async () => {
    const now = new Date();
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);

    await expect(
      createNudge(db, {
        fromProfileId: parentBProfileId,
        toProfileId: childXProfileId,
        template: 'thinking_of_you',
      }),
    ).rejects.toThrow(RateLimitedError);
  });

  // ── 4. Concurrency BREAK test (I1 atomicity) ──────────────────────────────
  //
  // With count at 3, fire 5 concurrent createNudge calls from parent A.
  // The pg_advisory_xact_lock at the top of the transaction serialises
  // writers by recipient profile, so only one count-then-insert pair runs
  // at a time and the rate limit is enforced atomically.
  //
  // RED/GREEN verification (run manually against Neon for reliable results):
  //
  //   RED:  Remove the `tx.execute(sql\`SELECT pg_advisory_xact_lock(...)\`)`
  //         line at the top of the transaction body in nudge.ts so the
  //         count + insert run under plain READ COMMITTED with no mutex.
  //         Against Neon (network latency widens the race window), this test
  //         fails because multiple concurrent calls read count=3 before any
  //         insert commits, and multiple inserts succeed (rows > 4).
  //         Against local Postgres the window is narrow — the race may not
  //         manifest every run, but can be forced by inserting a pg_sleep in
  //         the transaction body between count and insert.
  //
  //   GREEN: Restore the pg_advisory_xact_lock call. At most 1 of the 5
  //          succeeds; rows stays <= 4.
  //          Verified GREEN: all 6 integration tests pass (2026-05-11).

  it('[PARENT-16][BREAK] concurrency: at most 1 of 5 concurrent calls succeeds when count is 3', async () => {
    const now = new Date();
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);
    await seedNudgeRow(parentAProfileId, childXProfileId, now);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        createNudge(db, {
          fromProfileId: parentAProfileId,
          toProfileId: childXProfileId,
          template: 'quick_session',
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');

    expect(succeeded.length).toBeLessThanOrEqual(1);

    const NUDGE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() - NUDGE_WINDOW_MS);
    const rows = await db
      .select()
      .from(nudges)
      .where(
        and(
          eq(nudges.fromProfileId, parentAProfileId),
          eq(nudges.toProfileId, childXProfileId),
          gt(nudges.createdAt, windowStart),
        ),
      );
    expect(rows.length).toBeLessThanOrEqual(4);
  });

  // ── 5. IDOR BREAK test — markNudgeRead ────────────────────────────────────

  it('[BREAK] markNudgeRead: wrong profileId returns 0 and leaves nudge unread', async () => {
    const { nudge } = await createNudge(db, {
      fromProfileId: parentAProfileId,
      toProfileId: childXProfileId,
      template: 'you_got_this',
    });

    const count = await markNudgeRead(db, childYProfileId, nudge.id);
    expect(count).toBe(0);

    const row = await db.query.nudges.findFirst({
      where: eq(nudges.id, nudge.id),
    });
    expect(row).toBeDefined();
    expect(row!.readAt).toBeNull();
  });

  it('markNudgeRead is idempotent: retry of already-read nudge returns 1', async () => {
    // Network-failure retry path: route returns 404 if service returns 0, so
    // the idempotency invariant lives at the service layer.
    const { nudge } = await createNudge(db, {
      fromProfileId: parentAProfileId,
      toProfileId: childXProfileId,
      template: 'you_got_this',
    });

    const first = await markNudgeRead(db, childXProfileId, nudge.id);
    expect(first).toBe(1);

    const second = await markNudgeRead(db, childXProfileId, nudge.id);
    expect(second).toBe(1);
  });

  // ── 6. IDOR BREAK test — markAllNudgesRead ────────────────────────────────

  it('[BREAK] markAllNudgesRead: wrong profileId returns 0 and leaves nudges unread', async () => {
    await seedNudgeRow(parentAProfileId, childXProfileId);
    await seedNudgeRow(parentAProfileId, childXProfileId);

    const count = await markAllNudgesRead(db, childYProfileId);
    expect(count).toBe(0);

    const unread = await db
      .select()
      .from(nudges)
      .where(
        and(eq(nudges.toProfileId, childXProfileId), isNull(nudges.readAt)),
      );
    expect(unread.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// [WI-809] createNudge consent gate — v2 flag-ON path (real DB)
//
// Post-M-DROP the legacy `consent_states` table is gone, so flag-on createNudge
// must route the consent decision through the GDPR-pinned v2 gate
// (isGdprProcessingAllowedV2) instead of legacy getConsentStatus. This suite
// seeds ONLY the v2 graph (organization / person / membership / guardianship /
// consent_grant) and NEVER seeds a legacy consent_states row for the child, so:
//   • a WITHDRAWN GDPR grant blocks the nudge with ConsentRequiredError, and
//   • a CONSENTED grant lets it through end-to-end.
// RED/GREEN: revert the nudge.ts flag branch (flag-on falls back to legacy
// getConsentStatus reading the empty consent_states) → the child resolves to
// null (no row) → "allowed" → the [BLOCK] case no longer throws → it FAILS.
//
// AGENTS.md rule: no internal jest.mock() in integration tests.
// ===========================================================================

const V2_RUN = generateUUIDv7();

describeIfPostDrop('createNudge v2 consent gate (integration)', () => {
  let v2db: Database;
  let orgId: string;
  let guardianPersonId: string;
  let childPersonId: string;

  beforeAll(async () => {
    installFetchInterceptor();
    mockExpoPush();
    v2db = createDatabase(process.env.DATABASE_URL!);

    const [org] = await v2db
      .insert(organization)
      .values({ name: `nudge-v2-${V2_RUN}` })
      .returning({ id: organization.id });
    orgId = org!.id;

    const [guardian] = await v2db
      .insert(person)
      .values({
        displayName: 'Guardian V2',
        birthDate: '1980-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning({ id: person.id });
    guardianPersonId = guardian!.id;

    const [child] = await v2db
      .insert(person)
      .values({
        displayName: 'Child V2',
        birthDate: '2015-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning({ id: person.id });
    childPersonId = child!.id;

    // org resolution for isGdprProcessingAllowedV2 hangs off the child's membership
    await v2db.insert(membership).values({
      personId: childPersonId,
      organizationId: orgId,
      roles: ['learner'],
    });
    // assertParentAccess (v2) requires an ACTIVE guardianship edge
    await v2db.insert(guardianship).values({
      guardianPersonId,
      chargePersonId: childPersonId,
      revokedAt: null,
    });
    // push delivery for the ALLOW case (notification_preferences is keyed by
    // profileId = person.id and is NOT one of the dropped tables)
    await v2db.insert(notificationPreferences).values({
      profileId: childPersonId,
      pushEnabled: true,
      expoPushToken: `ExponentPushToken[nudge-v2-${V2_RUN}]`,
    });
  });

  afterAll(async () => {
    // FK-safe order: edges/leaves before person/org.
    await v2db.delete(nudges).where(eq(nudges.toProfileId, childPersonId));
    await v2db
      .delete(notificationPreferences)
      .where(eq(notificationPreferences.profileId, childPersonId));
    await v2db
      .delete(consentGrant)
      .where(eq(consentGrant.chargePersonId, childPersonId));
    await v2db
      .delete(guardianship)
      .where(eq(guardianship.chargePersonId, childPersonId));
    await v2db.delete(membership).where(eq(membership.personId, childPersonId));
    await v2db.delete(person).where(eq(person.id, childPersonId));
    await v2db.delete(person).where(eq(person.id, guardianPersonId));
    await v2db.delete(organization).where(eq(organization.id, orgId));
    restoreFetch();
  });

  beforeEach(async () => {
    clearFetchCalls();
    await v2db.delete(nudges).where(eq(nudges.toProfileId, childPersonId));
    await v2db
      .delete(consentGrant)
      .where(eq(consentGrant.chargePersonId, childPersonId));
  });

  // Midday UTC keeps the push out of quiet hours (org timezone is null → UTC).
  function middayUtc(): Date {
    const d = new Date();
    d.setUTCHours(14, 0, 0, 0);
    return d;
  }

  it('[BLOCK] flag-on: a WITHDRAWN GDPR grant blocks the nudge via the v2 gate (no legacy consent_states row exists)', async () => {
    await v2db.insert(consentGrant).values({
      chargePersonId: childPersonId,
      organizationId: orgId,
      purpose: 'platform_use',
      lawfulBasis: 'gdpr_parental_consent',
      granted: true,
      grantedAt: new Date(),
      withdrawnAt: new Date(),
    });

    await expect(
      createNudge(
        v2db,
        {
          fromProfileId: guardianPersonId,
          toProfileId: childPersonId,
          template: 'you_got_this',
          now: middayUtc(),
        },
        { identityV2Enabled: true },
      ),
    ).rejects.toThrow(ConsentRequiredError);

    // No nudge row was written.
    const rows = await v2db
      .select()
      .from(nudges)
      .where(eq(nudges.toProfileId, childPersonId));
    expect(rows).toHaveLength(0);
  });

  it('flag-on: a CONSENTED GDPR grant lets the nudge through end-to-end', async () => {
    await v2db.insert(consentGrant).values({
      chargePersonId: childPersonId,
      organizationId: orgId,
      purpose: 'platform_use',
      lawfulBasis: 'gdpr_parental_consent',
      granted: true,
      grantedAt: new Date(),
    });

    const result = await createNudge(
      v2db,
      {
        fromProfileId: guardianPersonId,
        toProfileId: childPersonId,
        template: 'you_got_this',
        now: middayUtc(),
      },
      { identityV2Enabled: true },
    );

    expect(result.nudge.toProfileId).toBe(childPersonId);
    expect(result.nudge.fromDisplayName).toBe('Guardian V2');
    expect(result.pushSent).toBe(true);
    expect(getFetchCalls('exp.host/--/api/v2/push/send')).toHaveLength(1);
  });
});
