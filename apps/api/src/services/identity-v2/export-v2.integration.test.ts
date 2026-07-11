// ---------------------------------------------------------------------------
// [WI-809] generateExportV2 post-M-DROP survival — integration against the real
// v2 identity tables on the post-cutover stg DB (the four legacy identity tables
// accounts / profiles / consent_states / family_links are DROPPED).
//
// The fix under test: generateExportV2 calls the reused legacy generateExport
// with `{ learningOnlyProfileIds: personIds }`, so the legacy half skips the
// dropped-identity reads and only runs the learning-data + billing arrays. The
// identity sections are overridden from organization / login / membership /
// person / consent_grant / guardianship.
//
// Red-green-revert: revert export-v2.ts line 203-205 back to
//   `const legacy = await generateExport(db, organizationId);`  (no opts)
// → the legacy half runs `db.query.accounts.findFirst(...)` against the dropped
// table → 500 (`relation "accounts" does not exist`) → this test FAILS. Restore
// → the legacy identity reads are skipped → GREEN.
//
// No internal jest.mock (GC1/GC6): every row is seeded into the real v2 tables
// and a real learning-data row (subjects) proves the learning half still runs.
//
// [WI-805] RESOLVED — this suite was previously blocked. The reused legacy
// generateExport read the legacy `subscriptions` table UNCONDITIONALLY
// (export.ts:394 — not behind learningOnly), so on a post-drop DB (legacy
// `subscriptions` gone) the export 500'd with `relation "subscriptions" does
// not exist`. WI-805 gates that read behind learningOnly AND overrides the
// billing sections (subscriptions / quotaPools / topUpCredits) from the v2
// `subscription` chain, so generateExportV2 no longer touches the legacy
// `subscriptions` table at all. It now runs on any post-drop DB. The legacy
// billing-skip itself has a CI-lane red-green in export.integration.test.ts;
// this suite is the post-drop operator-rehearsal that the v2 billing path
// surfaces (only validatable on a post-repoint DB — the quota satellites' FK
// points at v2 `subscription` there).
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import {
  consentGrant,
  createDatabase,
  guardianship,
  login,
  membership,
  organization,
  person,
  quotaPools,
  subjects,
  subscription,
  topUpCredits,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { generateExportV2 } from './export-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

// Gate: requires a post-M-DROP (0118) DB — the 4 legacy identity tables dropped.
// [WI-805] The old EXPORT_V2_INTEGRATION_READY gate (which required legacy
// `subscriptions` to still be PRESENT, because the reused legacy generateExport
// read it unconditionally) is removed: generateExportV2 no longer touches the
// legacy `subscriptions` table (the read is learningOnly-gated and billing is
// overridden from the v2 `subscription` chain), so it runs on any post-drop DB.
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfPostDrop =
  hasDatabaseUrl && process.env.IDENTITY_POST_DROP === '1'
    ? describe
    : describe.skip;

describeIfPostDrop('generateExportV2 (integration)', () => {
  let db: Database;
  const personIds: string[] = [];
  const orgIds: string[] = [];

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    // FK-safe order: v2 subscription (refs org + payer person) → leaves/edges →
    // person → organization.
    for (const oid of orgIds) {
      await db.delete(subscription).where(eq(subscription.organizationId, oid));
    }
    for (const pid of personIds) {
      await db.delete(subjects).where(eq(subjects.profileId, pid));
      await db.delete(consentGrant).where(eq(consentGrant.chargePersonId, pid));
      await db
        .delete(guardianship)
        .where(eq(guardianship.guardianPersonId, pid));
      await db.delete(guardianship).where(eq(guardianship.chargePersonId, pid));
      await db.delete(login).where(eq(login.personId, pid));
      await db.delete(membership).where(eq(membership.personId, pid));
      await db.delete(person).where(eq(person.id, pid));
    }
    for (const oid of orgIds) {
      await db.delete(organization).where(eq(organization.id, oid));
    }
    personIds.length = 0;
    orgIds.length = 0;
  });

  it('exports identity + learning data over the v2 tables without touching the dropped legacy tables', async () => {
    // Org (account stand-in).
    const [org] = await db
      .insert(organization)
      .values({ name: 'Export V2 Org' })
      .returning();
    orgIds.push(org!.id);

    // Owner person: admin membership + a login carrying the account email.
    const [owner] = await db
      .insert(person)
      .values({
        displayName: 'Owner',
        birthDate: '1980-06-15',
        residenceJurisdiction: 'EU',
      })
      .returning();
    personIds.push(owner!.id);
    await db.insert(membership).values({
      personId: owner!.id,
      organizationId: org!.id,
      roles: ['admin'],
    });
    const ownerEmail = `export-v2-owner-${owner!.id}@integration.test`;
    await db.insert(login).values({
      personId: owner!.id,
      clerkUserId: `export-v2-clerk-${owner!.id}`,
      email: ownerEmail,
    });

    // Child person: learner membership + an active guardianship from owner.
    const [child] = await db
      .insert(person)
      .values({
        displayName: 'Child',
        birthDate: '2015-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning();
    personIds.push(child!.id);
    await db.insert(membership).values({
      personId: child!.id,
      organizationId: org!.id,
      roles: ['learner'],
    });
    await db.insert(guardianship).values({
      guardianPersonId: owner!.id,
      chargePersonId: child!.id,
      revokedAt: null,
    });

    // A granted GDPR consent for the child (current GDPR state = CONSENTED).
    await db.insert(consentGrant).values({
      chargePersonId: child!.id,
      organizationId: org!.id,
      purpose: 'platform_use',
      lawfulBasis: 'gdpr_parental_consent',
      granted: true,
      grantedAt: new Date(),
    });

    // A learning-data row keyed on a person id — proves the legacy learning half
    // still runs via the passed learningOnlyProfileIds.
    await db.insert(subjects).values({
      profileId: child!.id,
      name: 'Math',
    });

    // [WI-805] A v2 subscription for the org — proves the billing sections now
    // surface from the v2 `subscription` chain, read WITHOUT touching the
    // dropped legacy `subscriptions` table. (quotaPools / topUpCredits follow
    // the same v2-sub-id read; their FK points at v2 `subscription` post-0117.)
    await db.insert(subscription).values({
      organizationId: org!.id,
      planTier: 'free',
      status: 'active',
      payerPersonId: owner!.id,
    });

    // The point of the fix: this RESOLVES post-M-DROP instead of 500-ing on the
    // dropped accounts/profiles/consent_states/family_links tables.
    const result = await generateExportV2(db, org!.id);

    // (b) account email comes from the owner login.
    expect(result.account.email).toBe(ownerEmail);
    // (c) the child appears in the v2 profiles export.
    expect(result.profiles.map((p) => p.id)).toContain(child!.id);
    const ownerProfile = result.profiles.find((p) => p.id === owner!.id);
    expect(ownerProfile?.birthMonth).toBe(6);
    expect(ownerProfile?.birthDay).toBe(15);
    const childProfile = result.profiles.find((p) => p.id === child!.id);
    expect(childProfile?.birthMonth).toBeNull();
    expect(childProfile?.birthDay).toBeNull();
    // (d) the learning half ran: the seeded subject is in the export.
    expect(
      result.subjects.some(
        (s) =>
          (s as { profileId?: string }).profileId === child!.id &&
          (s as { name?: string }).name === 'Math',
      ),
    ).toBe(true);
    // (e) [WI-805] billing surfaces from the v2 `subscription`, not the dropped
    // legacy `subscriptions` table.
    expect(result.subscriptions).toHaveLength(1);
    // (f) [WI-1161] the v2 row is mapped to the legacy export shape BEFORE
    // dataExportSubscriptionRowSchema.parse — organizationId→accountId,
    // planTier→tier, periodStartAt/EndAt→currentPeriodStart/End. Red-green-revert:
    // revert export-v2.ts back to parsing the RAW v2 row (serializeDates(s)) and
    // the schema .parse() ZodErrors (required accountId/tier undefined) →
    // generateExportV2 throws → this assertion is never reached (suite red).
    // Restore the map → the legacy-named fields are present → GREEN.
    expect((result.subscriptions[0] as { accountId?: string }).accountId).toBe(
      org!.id,
    );
    expect((result.subscriptions[0] as { tier?: string }).tier).toBe('free');
  });
});

// ---------------------------------------------------------------------------
// [WI-1161] generateExportV2 subscription field-mapping — runs on ANY DB with
// the v2 tables (NOT post-drop-gated), so it executes in the standard CI
// integration lane (the post-drop suite above is operator-rehearsal only and
// is skipped in CI). It seeds the minimal v2 graph (no `subjects` row, so the
// pre-drop journaled-chain `subjects.profileId → profiles.id` FK is irrelevant)
// and asserts generateExportV2 maps the v2 `subscription` row to the legacy
// export shape before dataExportSubscriptionRowSchema.parse.
//
// Red-green-revert: revert export-v2.ts to parse the RAW v2 row
// (serializeDates(s)) → the schema .parse() ZodErrors (accountId/tier undefined)
// → generateExportV2 throws → this test FAILS. Restore the map → GREEN.
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

describeIfDb('generateExportV2 subscription mapping [WI-1161]', () => {
  let db: Database;
  const personIds: string[] = [];
  const orgIds: string[] = [];

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    for (const oid of orgIds) {
      await db.delete(subscription).where(eq(subscription.organizationId, oid));
    }
    for (const pid of personIds) {
      await db.delete(login).where(eq(login.personId, pid));
      await db.delete(membership).where(eq(membership.personId, pid));
      await db.delete(person).where(eq(person.id, pid));
    }
    for (const oid of orgIds) {
      await db.delete(organization).where(eq(organization.id, oid));
    }
    personIds.length = 0;
    orgIds.length = 0;
  });

  it('maps the v2 subscription row to the legacy export shape (accountId/tier/currentPeriod*) before schema parse', async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: 'Export V2 Mapping Org' })
      .returning();
    orgIds.push(org!.id);

    const [owner] = await db
      .insert(person)
      .values({
        displayName: 'Owner',
        birthDate: '1980-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning();
    personIds.push(owner!.id);
    await db.insert(membership).values({
      personId: owner!.id,
      organizationId: org!.id,
      roles: ['admin'],
    });
    await db.insert(login).values({
      personId: owner!.id,
      clerkUserId: `export-v2-map-clerk-${owner!.id}`,
      email: `export-v2-map-${owner!.id}@integration.test`,
    });

    const periodStart = new Date('2026-01-01T00:00:00.000Z');
    const periodEnd = new Date('2026-02-01T00:00:00.000Z');
    await db.insert(subscription).values({
      organizationId: org!.id,
      planTier: 'plus',
      status: 'active',
      payerPersonId: owner!.id,
      storeProductId: 'com.mentomate.plus.monthly',
      storePlatform: 'APP_STORE',
      periodStartAt: periodStart,
      periodEndAt: periodEnd,
      stripeCustomerId: `cus_export_${owner!.id}`,
    });

    // Pre-fix this throws (ZodError: accountId/tier undefined) — the await rejects.
    const result = await generateExportV2(db, org!.id);

    expect(result.subscriptions).toHaveLength(1);
    const row = result.subscriptions[0] as {
      accountId?: string;
      tier?: string;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      stripeCustomerId?: string | null;
      payerPersonId?: string;
      storeProductId?: string | null;
      storePlatform?: string | null;
      organizationId?: string;
      planTier?: string;
    };
    // Mapped legacy-named fields present and sourced from the v2 row:
    expect(row.accountId).toBe(org!.id);
    expect(row.tier).toBe('plus');
    expect(row.currentPeriodStart).toBe(periodStart.toISOString());
    expect(row.currentPeriodEnd).toBe(periodEnd.toISOString());
    expect(row.stripeCustomerId).toBe(`cus_export_${owner!.id}`);
    expect(row.payerPersonId).toBe(owner!.id);
    expect(row.storeProductId).toBe('com.mentomate.plus.monthly');
    expect(row.storePlatform).toBe('APP_STORE');
    expect(
      (result as unknown as { subscriptionFieldDescriptions?: unknown })
        .subscriptionFieldDescriptions,
    ).toEqual({
      payerPersonId: {
        label: 'Person responsible for payment',
        description:
          'The identifier of the person responsible for the subscription payment relationship.',
      },
      storeProductId: {
        label: 'Store product',
        description:
          'The product identifier assigned by the app store for this subscription, when applicable.',
      },
      storePlatform: {
        label: 'Store platform',
        description:
          'The app-store platform that supplied this subscription, when applicable.',
      },
    });
    // Raw v2 field names are stripped by the schema parse (not leaked):
    expect(row.organizationId).toBeUndefined();
    expect(row.planTier).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// [WI-1097] familyLinks field-mapping regression — runs on ANY DB with the v2
// identity tables (NOT post-drop-gated). Verifies that generateExportV2 maps
// guardianship edges to the correct familyLinks contract shape
// {id, parentProfileId, childProfileId, createdAt} and that the pre-v2
// fields (guardianPersonId, chargePersonId, qualification, grantedAt) are
// ABSENT.
//
// Red-green-revert: revert export-v2.ts to the pre-WI-1097 mapping:
//   familyLinks: relevantEdges.map((g) =>
//     serializeDates({ guardianPersonId: g.guardianPersonId,
//       chargePersonId: g.chargePersonId, qualification: g.qualification,
//       grantedAt: g.grantedAt, createdAt: g.createdAt }),
//   )
// → dataExportFamilyLinkRowSchema.parse() throws (required `id`,
//   `parentProfileId`, `childProfileId` absent from the input)
// → generateExportV2 rejects → this test FAILS. Restore the correct mapping
// → parse succeeds → GREEN.
// ---------------------------------------------------------------------------
describeIfDb('generateExportV2 familyLinks field mapping [WI-1097]', () => {
  let db: Database;
  const personIds: string[] = [];
  const orgIds: string[] = [];

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    for (const pid of personIds) {
      await db
        .delete(guardianship)
        .where(eq(guardianship.guardianPersonId, pid));
      await db.delete(guardianship).where(eq(guardianship.chargePersonId, pid));
      await db.delete(login).where(eq(login.personId, pid));
      await db.delete(membership).where(eq(membership.personId, pid));
      await db.delete(person).where(eq(person.id, pid));
    }
    for (const oid of orgIds) {
      await db.delete(organization).where(eq(organization.id, oid));
    }
    personIds.length = 0;
    orgIds.length = 0;
  });

  it('maps guardianship edges to {id, parentProfileId, childProfileId, createdAt} — qualification and grantedAt absent', async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: 'FamilyLinks Mapping Org' })
      .returning();
    orgIds.push(org!.id);

    const [owner] = await db
      .insert(person)
      .values({
        displayName: 'Owner',
        birthDate: '1980-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning();
    personIds.push(owner!.id);
    await db.insert(membership).values({
      personId: owner!.id,
      organizationId: org!.id,
      roles: ['admin'],
    });
    await db.insert(login).values({
      personId: owner!.id,
      clerkUserId: `fl-map-owner-${owner!.id}`,
      email: `fl-map-owner-${owner!.id}@integration.test`,
    });

    const [child] = await db
      .insert(person)
      .values({
        displayName: 'Child',
        birthDate: '2015-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning();
    personIds.push(child!.id);
    await db.insert(membership).values({
      personId: child!.id,
      organizationId: org!.id,
      roles: ['learner'],
    });

    const [edge] = await db
      .insert(guardianship)
      .values({
        guardianPersonId: owner!.id,
        chargePersonId: child!.id,
        revokedAt: null,
      })
      .returning();

    const result = await generateExportV2(db, org!.id);

    expect(result.familyLinks).toHaveLength(1);
    const link = result.familyLinks![0] as Record<string, unknown>;
    // Correct contract fields present and correctly sourced:
    expect(link['id']).toBe(edge!.id);
    expect(link['parentProfileId']).toBe(owner!.id);
    expect(link['childProfileId']).toBe(child!.id);
    expect(typeof link['createdAt']).toBe('string');
    // Pre-WI-1097 fields must be absent — they were never part of the
    // family_links contract; the loose z.record schema silently allowed them.
    expect(link['guardianPersonId']).toBeUndefined();
    expect(link['chargePersonId']).toBeUndefined();
    expect(link['qualification']).toBeUndefined();
    expect(link['grantedAt']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// [WI-1097] quotaPools and topUpCredits schema-parse coverage — gated on the
// post-0117 DB (IDENTITY_POST_DROP=1) where quota_pools.subscription_id FK
// was repointed from legacy `subscriptions` to v2 `subscription`. In the
// standard CI DB (Flag-ON lane) the FK still references the old table, so
// inserts against the v2 `subscription` row violate the constraint. This
// suite skips automatically in that lane and runs in the post-drop lane.
//
// Red-green-revert: revert export-v2.ts to the pre-WI-1097 mapping:
//   quotaPools: quotaPoolRows.map(serializeDates),
//   topUpCredits: topUpCreditRows.map(serializeDates),
// → the .parse() call is removed; the output still passes these assertions
//   (DB rows have the right fields), but any future column addition that
//   doesn't match the schema would silently leak into the export. The parse
//   call enforces the contract at runtime. This test confirms the parse path
//   runs without throwing for valid rows.
// ---------------------------------------------------------------------------
describeIfPostDrop(
  'generateExportV2 quotaPools and topUpCredits schema parse [WI-1097]',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterAll(async () => {
      // subscription ON DELETE CASCADE removes quota_pools and top_up_credits.
      for (const oid of orgIds) {
        await db
          .delete(subscription)
          .where(eq(subscription.organizationId, oid));
      }
      for (const pid of personIds) {
        await db.delete(login).where(eq(login.personId, pid));
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      for (const oid of orgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      personIds.length = 0;
      orgIds.length = 0;
    });

    it('exports quotaPools and topUpCredits with the expected schema-validated shape', async () => {
      const [org] = await db
        .insert(organization)
        .values({ name: 'Quota Export Org' })
        .returning();
      orgIds.push(org!.id);

      const [owner] = await db
        .insert(person)
        .values({
          displayName: 'Owner',
          birthDate: '1980-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(owner!.id);
      await db.insert(membership).values({
        personId: owner!.id,
        organizationId: org!.id,
        roles: ['admin'],
      });
      await db.insert(login).values({
        personId: owner!.id,
        clerkUserId: `quota-owner-${owner!.id}`,
        email: `quota-owner-${owner!.id}@integration.test`,
      });

      const [sub] = await db
        .insert(subscription)
        .values({
          organizationId: org!.id,
          planTier: 'plus',
          status: 'active',
          payerPersonId: owner!.id,
        })
        .returning();

      const cycleResetAt = new Date('2026-07-01T00:00:00.000Z');
      const [pool] = await db
        .insert(quotaPools)
        .values({
          subscriptionId: sub!.id,
          monthlyLimit: 700,
          cycleResetAt,
        })
        .returning();

      const expiresAt = new Date('2027-01-01T00:00:00.000Z');
      const [credit] = await db
        .insert(topUpCredits)
        .values({
          subscriptionId: sub!.id,
          amount: 50,
          remaining: 50,
          expiresAt,
        })
        .returning();

      const result = await generateExportV2(db, org!.id);

      // quotaPool round-trips through dataExportQuotaPoolRowSchema.parse():
      expect(result.quotaPools).toHaveLength(1);
      const poolRow = result.quotaPools![0] as Record<string, unknown>;
      expect(poolRow['id']).toBe(pool!.id);
      expect(poolRow['subscriptionId']).toBe(sub!.id);
      expect(poolRow['monthlyLimit']).toBe(700);
      expect(poolRow['usedThisMonth']).toBe(0);
      expect(poolRow['cycleResetAt']).toBe(cycleResetAt.toISOString());

      // topUpCredit round-trips through dataExportTopUpCreditRowSchema.parse():
      expect(result.topUpCredits).toHaveLength(1);
      const creditRow = result.topUpCredits![0] as Record<string, unknown>;
      expect(creditRow['id']).toBe(credit!.id);
      expect(creditRow['subscriptionId']).toBe(sub!.id);
      expect(creditRow['amount']).toBe(50);
      expect(creditRow['remaining']).toBe(50);
      expect(creditRow['expiresAt']).toBe(expiresAt.toISOString());
    });
  },
);
