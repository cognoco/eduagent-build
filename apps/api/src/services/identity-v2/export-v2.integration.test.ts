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
// ⚠️ BLOCKED on this `-c stg` DB (2026-06-16). The reused legacy generateExport
// reads the legacy `subscriptions` table UNCONDITIONALLY (export.ts:394 — NOT
// behind learningOnly), and the WI-809 fix deliberately does not gate it: the
// fix comment (export-v2.ts:62-63) records that the legacy `subscriptions` drop
// is WI-805's scope, and the #8 M-DROP migration (0118_m_drop.sql) RETAINS
// `subscriptions` by design. But the current stg DB has DRIFTED ahead — its
// `subscriptions` table is already gone (only the v2 singular `subscription`
// remains) — so the export 500s here with `relation "subscriptions" does not
// exist`. That is environment drift (a DB that migration 0118 would never
// produce), not a WI-809 defect: there is no GREEN baseline to red-green
// against on this DB. Restore `subscriptions` to the stg DB (re-align it to the
// 0118 target) OR land the WI-805 billing-export cutover, then this test is
// runnable. See the deliverable writeup for full detail.
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
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { generateExportV2 } from './export-v2';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

// Gate: requires the EXACT post-M-DROP (0118) target state — the 4 identity
// tables dropped AND `subscriptions` still PRESENT. The reused legacy
// generateExport reads `subscriptions` unconditionally (export.ts; that read
// stays WI-805 scope), so on the current drifted stg DB (subscriptions dropped
// ahead of WI-805) `IDENTITY_POST_DROP=1` alone would activate the suite and
// fail with a MISLEADING `relation "subscriptions" does not exist` 500 that looks
// like a test regression. A dedicated EXPORT_V2_INTEGRATION_READY=1 gate makes the
// blockage machine-detectable: the suite skips cleanly unless the operator has
// confirmed a subscriptions-present post-drop DB (true post-#8, or post-WI-805
// re-seed). [WI-809 review CONSIDER: claude-review L44-45 / Codex.]
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfPostDrop =
  hasDatabaseUrl &&
  process.env.IDENTITY_POST_DROP === '1' &&
  process.env.EXPORT_V2_INTEGRATION_READY === '1'
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
    // FK-safe order: leaves/edges → person → organization.
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
  });
});
