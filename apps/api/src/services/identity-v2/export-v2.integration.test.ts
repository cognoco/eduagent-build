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
  subjects,
  subscription,
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
    expect(
      (result.subscriptions[0] as { organizationId?: string }).organizationId,
    ).toBe(org!.id);
  });
});
