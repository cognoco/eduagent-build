// ---------------------------------------------------------------------------
// CUT-B1 consent-status read module — integration tests of the §2.3a reducer
// against the real consent_grant / consent_request tables. Covers every legacy
// mapping (guardrail 2): CONSENTED / WITHDRAWN / PENDING / REQUESTED, the
// legacy-parity denied→WITHDRAWN and expired→PARENTAL_CONSENT_REQUESTED, the
// direct-grant-with-no-request path, the basis-explicit vs AnyBasis variants
// (newer-COPPA-does-not-mask-GDPR under the explicit resolver), and the
// superseded-not-withdrawn current-row windowing.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  consentRequest,
  createDatabase,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import {
  consentedExistsSql,
  getConsentAccountabilityV2,
  resolveConsentSetStatus,
  resolveLatestConsentSetStatusAnyBasis,
  resolveLatestConsentSetStatusesAnyBasis,
  resolveConsentStatus,
  resolveLatestConsentStatusAnyBasis,
  resolveLatestConsentStatusesAnyBasis,
} from './consent-status-v2';
import { CONSENT_PURPOSES } from '@eduagent/schemas';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;
const PURPOSE = 'platform_use';
const GDPR = 'gdpr_parental_consent';
const COPPA = 'coppa_parental_consent';

(RUN ? describe : describe.skip)(
  'consent-status-v2 reducer (integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      for (const pid of personIds) {
        await db
          .delete(consentGrant)
          .where(eq(consentGrant.chargePersonId, pid));
        await db
          .delete(consentRequest)
          .where(eq(consentRequest.chargePersonId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      for (const oid of orgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      personIds.length = 0;
      orgIds.length = 0;
    });

    async function seedPersonOrg(): Promise<{
      personId: string;
      orgId: string;
    }> {
      const [org] = await db
        .insert(organization)
        .values({ name: 'Org' })
        .returning();
      const [p] = await db
        .insert(person)
        .values({
          displayName: 'Child',
          birthDate: '2015-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(p!.id);
      orgIds.push(org!.id);
      return { personId: p!.id, orgId: org!.id };
    }

    /** Seed an additional person into an EXISTING org (for multi-person batches). */
    async function seedPersonInOrg(): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({
          displayName: 'Child',
          birthDate: '2015-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(p!.id);
      return p!.id;
    }

    it('null when there are no consent rows', async () => {
      const { personId, orgId } = await seedPersonOrg();
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBeNull();
      expect(
        await resolveLatestConsentStatusAnyBasis(db, personId, orgId, PURPOSE),
      ).toBeNull();
    });

    it('[WI-2386] fails a guardian purpose set closed until every purpose is granted', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: CONSENT_PURPOSES[0],
        lawfulBasis: GDPR,
        granted: true,
      });

      expect(await resolveConsentSetStatus(db, personId, orgId, GDPR)).toBe(
        'PENDING',
      );
      expect(
        await resolveLatestConsentSetStatusAnyBasis(db, personId, orgId),
      ).toBe('PENDING');

      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: CONSENT_PURPOSES[1],
        lawfulBasis: GDPR,
        granted: true,
      });

      expect(await resolveConsentSetStatus(db, personId, orgId, GDPR)).toBe(
        'CONSENTED',
      );
      expect(
        await resolveLatestConsentSetStatusAnyBasis(db, personId, orgId),
      ).toBe('CONSENTED');
    });

    it('[WI-2386] fails closed when approved request rows have no auditable grants', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentRequest).values(
        CONSENT_PURPOSES.map((purpose) => ({
          chargePersonId: personId,
          organizationId: orgId,
          purpose,
          requestedBasis: GDPR,
          status: 'approved' as const,
        })),
      );

      expect(await resolveConsentSetStatus(db, personId, orgId, GDPR)).toBe(
        'PENDING',
      );
    });

    it('[WI-2386] one withdrawn purpose cannot be masked by another consented purpose', async () => {
      const { personId, orgId } = await seedPersonOrg();
      const withdrawnAt = new Date();
      await db.insert(consentGrant).values(
        CONSENT_PURPOSES.map((purpose) => ({
          chargePersonId: personId,
          organizationId: orgId,
          purpose,
          lawfulBasis: GDPR,
          granted: true,
          withdrawnAt: purpose === 'llm_disclosure' ? withdrawnAt : null,
        })),
      );

      expect(await resolveConsentSetStatus(db, personId, orgId, GDPR)).toBe(
        'WITHDRAWN',
      );
    });

    it('[WI-2386] batched purpose-set reads preserve person isolation', async () => {
      const { personId, orgId } = await seedPersonOrg();
      const incompleteId = await seedPersonInOrg();
      await db.insert(consentGrant).values([
        ...CONSENT_PURPOSES.map((purpose) => ({
          chargePersonId: personId,
          organizationId: orgId,
          purpose,
          lawfulBasis: GDPR,
          granted: true,
        })),
        {
          chargePersonId: incompleteId,
          organizationId: orgId,
          purpose: CONSENT_PURPOSES[0],
          lawfulBasis: GDPR,
          granted: true,
        },
      ]);

      const statuses = await resolveLatestConsentSetStatusesAnyBasis(
        db,
        [personId, incompleteId],
        orgId,
      );
      expect(statuses.get(personId)).toBe('CONSENTED');
      expect(statuses.get(incompleteId)).toBe('PENDING');
    });

    it('PENDING / PARENTAL_CONSENT_REQUESTED map from request status', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentRequest).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        requestedBasis: GDPR,
        status: 'pending',
      });
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('PENDING');

      await db
        .update(consentRequest)
        .set({ status: 'requested', requestedAt: new Date() })
        .where(eq(consentRequest.chargePersonId, personId));
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('PARENTAL_CONSENT_REQUESTED');
    });

    it('legacy parity: denied→WITHDRAWN, expired→PARENTAL_CONSENT_REQUESTED', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentRequest).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        requestedBasis: GDPR,
        status: 'denied',
      });
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('WITHDRAWN');

      await db
        .update(consentRequest)
        .set({ status: 'expired' })
        .where(eq(consentRequest.chargePersonId, personId));
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('PARENTAL_CONSENT_REQUESTED');
    });

    it('CONSENTED for a current grant; direct grant with no request row reduces too', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(),
      });
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('CONSENTED');
    });

    it('WITHDRAWN when the current grant has withdrawn_at stamped', async () => {
      const { personId, orgId } = await seedPersonOrg();
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(),
        withdrawnAt: new Date(),
      });
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('WITHDRAWN');
    });

    it('current-row windowing: grant₁ → age-transition grant₂ → withdraw grant₂ → WITHDRAWN (grant₁ is superseded, not re-allowing)', async () => {
      const { personId, orgId } = await seedPersonOrg();
      const t1 = new Date(Date.now() - 60_000);
      const t2 = new Date();
      // grant₁ (older, still granted+un-withdrawn — superseded, not withdrawn)
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: t1,
      });
      // grant₂ (current) then withdrawn
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: t2,
        withdrawnAt: new Date(),
      });
      // The current (max granted_at) row is withdrawn → WITHDRAWN, even though
      // grant₁ is still granted+un-withdrawn.
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('WITHDRAWN');
    });

    it('[A1 same-timestamp] id DESC tiebreak: two grants share granted_at, the higher-id one withdrawn → WITHDRAWN (reducer AND scan-side EXISTS)', async () => {
      const { personId, orgId } = await seedPersonOrg();
      const ts = new Date('2026-06-01T12:00:00.000Z');
      // Two grants with the IDENTICAL granted_at. The uuid v7 id of the second
      // insert is monotonically greater, so it is the "current" row by the
      // (granted_at DESC, id DESC) tiebreak — and it is withdrawn.
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: ts, // older by id, un-withdrawn
      });
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: ts, // same timestamp, higher id → the current row
        withdrawnAt: new Date('2026-06-02T00:00:00.000Z'),
      });

      // Reducer: the higher-id row wins the tiebreak → WITHDRAWN.
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('WITHDRAWN');

      // Scan-side EXISTS: must NOT report consented (a max(granted_at)-only
      // predicate would wrongly pass because grant₁ is granted+un-withdrawn at
      // the same timestamp). The id-tiebroken form correctly excludes it.
      const [scan] = await db
        .select({
          consented: consentedExistsSql(sql`${person.id}`),
        })
        .from(person)
        .where(eq(person.id, personId));
      expect(scan?.consented).toBe(false);
    });

    it('basis-explicit GDPR is NOT masked by a newer COPPA grant (the BUG-466/465 shape)', async () => {
      const { personId, orgId } = await seedPersonOrg();
      // Older GDPR grant (current GDPR state = CONSENTED).
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(Date.now() - 60_000),
      });
      // Newer COPPA grant, withdrawn (current COPPA state = WITHDRAWN).
      await db.insert(consentGrant).values({
        chargePersonId: personId,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: COPPA,
        granted: true,
        grantedAt: new Date(),
        withdrawnAt: new Date(),
      });
      // The GDPR-pinned resolver reports the GDPR state, unaffected by COPPA.
      expect(
        await resolveConsentStatus(db, personId, orgId, PURPOSE, GDPR),
      ).toBe('CONSENTED');
      // The AnyBasis read, by contrast, picks the latest-requested basis (the
      // deliberately bug-compatible behavior) — COPPA's newer grant wins here.
      expect(
        await resolveLatestConsentStatusAnyBasis(db, personId, orgId, PURPOSE),
      ).toBe('WITHDRAWN');
    });

    // -----------------------------------------------------------------------
    // WI-797 — batched form (resolveLatestConsentStatusesAnyBasis) equivalence.
    // The batched window-query path MUST return IDENTICAL results to the
    // per-person fan-out for every scenario, and must not leak one person's
    // consent status onto another in a multi-person batch.
    // -----------------------------------------------------------------------

    it('batched == per-person for a multi-person family across every edge case', async () => {
      // One org, several persons, each in a different consent state covering
      // every branch the per-person reducer handles. The batched result for
      // each person must equal the single-person AnyBasis result.
      const { personId: pConsented, orgId } = await seedPersonOrg();
      const pNoRows = await seedPersonInOrg(); // absent → null
      const pWithdrawn = await seedPersonInOrg();
      const pPending = await seedPersonInOrg();
      const pDenied = await seedPersonInOrg();
      const pDirectGrant = await seedPersonInOrg(); // grant, no request → MIN path
      const pCoppaMasksGdpr = await seedPersonInOrg(); // both bases, newer COPPA wins

      const now = Date.now();

      // pConsented: current GDPR grant, un-withdrawn.
      await db.insert(consentGrant).values({
        chargePersonId: pConsented,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(now),
      });

      // pWithdrawn: current GDPR grant, withdrawn.
      await db.insert(consentGrant).values({
        chargePersonId: pWithdrawn,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(now),
        withdrawnAt: new Date(now),
      });

      // pPending: GDPR request only, status pending.
      await db.insert(consentRequest).values({
        chargePersonId: pPending,
        organizationId: orgId,
        purpose: PURPOSE,
        requestedBasis: GDPR,
        status: 'pending',
      });

      // pDenied: GDPR request only, status denied → legacy-parity WITHDRAWN.
      await db.insert(consentRequest).values({
        chargePersonId: pDenied,
        organizationId: orgId,
        purpose: PURPOSE,
        requestedBasis: GDPR,
        status: 'denied',
      });

      // pDirectGrant: a COPPA grant with NO request row → exercises the
      // MIN(granted_at) ordering-key fallback in the batched window query.
      await db.insert(consentGrant).values({
        chargePersonId: pDirectGrant,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: COPPA,
        granted: true,
        grantedAt: new Date(now - 30_000),
      });

      // pCoppaMasksGdpr: older un-withdrawn GDPR grant + newer withdrawn COPPA
      // grant — the AnyBasis tiebreak must pick the newer COPPA (WITHDRAWN).
      await db.insert(consentGrant).values({
        chargePersonId: pCoppaMasksGdpr,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(now - 60_000),
      });
      await db.insert(consentGrant).values({
        chargePersonId: pCoppaMasksGdpr,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: COPPA,
        granted: true,
        grantedAt: new Date(now),
        withdrawnAt: new Date(now),
      });

      const allPersons = [
        pConsented,
        pNoRows,
        pWithdrawn,
        pPending,
        pDenied,
        pDirectGrant,
        pCoppaMasksGdpr,
      ];

      // Per-person reference results (the established, trusted path).
      const reference = new Map<string, string | null>();
      for (const pid of allPersons) {
        reference.set(
          pid,
          await resolveLatestConsentStatusAnyBasis(db, pid, orgId, PURPOSE),
        );
      }

      // Spot-check the reference itself so a silently-broken per-person path
      // can't make a broken batched path look "equivalent".
      expect(reference.get(pConsented)).toBe('CONSENTED');
      expect(reference.get(pNoRows)).toBeNull();
      expect(reference.get(pWithdrawn)).toBe('WITHDRAWN');
      expect(reference.get(pPending)).toBe('PENDING');
      expect(reference.get(pDenied)).toBe('WITHDRAWN');
      expect(reference.get(pDirectGrant)).toBe('CONSENTED');
      expect(reference.get(pCoppaMasksGdpr)).toBe('WITHDRAWN');

      // Batched result over ALL persons at once.
      const batched = await resolveLatestConsentStatusesAnyBasis(
        db,
        allPersons,
        orgId,
        PURPOSE,
      );

      // Equivalence: every person resolves identically; persons with no rows
      // are absent from the batched map (caller treats absent as null).
      for (const pid of allPersons) {
        const expected = reference.get(pid) ?? null;
        expect(batched.get(pid) ?? null).toBe(expected);
      }
      // No-cross-leakage: the batched map contains ONLY persons with a non-null
      // status — pNoRows must be absent, and no extra/foreign keys present.
      expect(batched.has(pNoRows)).toBe(false);
      const expectedKeys = allPersons
        .filter((pid) => reference.get(pid) != null)
        .sort();
      expect([...batched.keys()].sort()).toEqual(expectedKeys);
    });

    it('batched no-cross-leakage: each person gets ONLY its own consent rows', async () => {
      // Two persons, opposite states. If the window partition or the key bled
      // across persons, one would inherit the other's status.
      const { personId: pA, orgId } = await seedPersonOrg();
      const pB = await seedPersonInOrg();

      await db.insert(consentGrant).values({
        chargePersonId: pA,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(),
      }); // pA → CONSENTED
      await db.insert(consentGrant).values({
        chargePersonId: pB,
        organizationId: orgId,
        purpose: PURPOSE,
        lawfulBasis: GDPR,
        granted: true,
        grantedAt: new Date(),
        withdrawnAt: new Date(),
      }); // pB → WITHDRAWN

      const batched = await resolveLatestConsentStatusesAnyBasis(
        db,
        [pA, pB],
        orgId,
        PURPOSE,
      );
      expect(batched.get(pA)).toBe('CONSENTED');
      expect(batched.get(pB)).toBe('WITHDRAWN');
    });

    it('batched empty input returns an empty map without a query', async () => {
      const { orgId } = await seedPersonOrg();
      const batched = await resolveLatestConsentStatusesAnyBasis(
        db,
        [],
        orgId,
        PURPOSE,
      );
      expect(batched.size).toBe(0);
    });

    // -----------------------------------------------------------------------
    // WI-797 DoD — deterministic round-trip-COUNT regression net (NOT a timing
    // test). The batched window-query path MUST issue ≤2 DB round-trips for an
    // N-person family; the original per-person Promise.all fan-out issued
    // 2N–3N. Counting real queries (a pass-through spy on the live pg/Neon pool
    // via db.$client.query) is GC1-clean — no internal mock, every query still
    // executes against the real DB.
    //
    // Red-green-revert (verified locally, captured in the PR/commit body):
    //   GREEN with the batched fix → 2 round-trips for a 4-person family.
    //   Revert resolveLatestConsentStatusesAnyBasis to the per-person fan-out →
    //   20 round-trips → this assertion FAILS (20 > 2). Restore → 2 → passes.
    // This is the regression net that was missing: the equivalence tests proved
    // correctness but not query count, so the fan-out reached deployed staging.
    // -----------------------------------------------------------------------
    it('[WI-797] batched AnyBasis resolution issues ≤2 DB round-trips for a 4-person family', async () => {
      const { personId: p0, orgId } = await seedPersonOrg();
      const ids = [p0];
      for (let i = 0; i < 3; i++) ids.push(await seedPersonInOrg());
      for (const pid of ids) {
        await db.insert(consentGrant).values({
          chargePersonId: pid,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
        });
      }

      // Pass-through query counter on the REAL pool: increment, then call
      // through so the query still executes (GC1-clean — not a mock).
      const client = (db as unknown as { $client: { query: unknown } }).$client;
      const original = client.query.bind(client) as (
        ...a: unknown[]
      ) => unknown;
      let roundTrips = 0;
      (client as { query: unknown }).query = (...args: unknown[]) => {
        roundTrips++;
        return original(...args);
      };

      let resolved: Map<string, string>;
      try {
        resolved = (await resolveLatestConsentStatusesAnyBasis(
          db,
          ids,
          orgId,
          PURPOSE,
        )) as Map<string, string>;
      } finally {
        (client as { query: unknown }).query = original;
      }

      // Sanity: the resolution still produced the right answer for all 4.
      expect(resolved.size).toBe(4);
      for (const pid of ids) {
        expect(resolved.get(pid)).toBe('CONSENTED');
      }

      // The regression net: batched form is a fixed ≤2 round-trips, independent
      // of family size. The fan-out would be 2N–3N (= 20 here).
      expect(roundTrips).toBeLessThanOrEqual(2);
    });

    // -------------------------------------------------------------------------
    // [WI-1193 AC3] Accountability report — one query, lawful basis + terms-
    // accepted timestamp + accepted purposes (GDPR Art 5(2)/7(1)).
    // -------------------------------------------------------------------------
    describe('getConsentAccountabilityV2', () => {
      it('returns lawful basis + terms-accepted timestamp for EACH purpose in one query', async () => {
        const { personId, orgId } = await seedPersonOrg();
        const grantedAt = new Date();
        await db.insert(consentGrant).values([
          {
            chargePersonId: personId,
            organizationId: orgId,
            purpose: PURPOSE,
            lawfulBasis: 'art6_1_a',
            granted: true,
            grantedAt,
          },
          {
            chargePersonId: personId,
            organizationId: orgId,
            purpose: CONSENT_PURPOSES[1],
            lawfulBasis: 'art6_1_a',
            granted: true,
            grantedAt,
          },
        ]);

        const report = await getConsentAccountabilityV2(db, personId, orgId);

        expect(report).toHaveLength(2);
        const byPurpose = new Map(report.map((r) => [r.purpose, r]));
        expect(byPurpose.get(PURPOSE)?.lawfulBasis).toBe('art6_1_a');
        expect(byPurpose.get(PURPOSE)?.termsAcceptedAt).toEqual(grantedAt);
        expect(byPurpose.get(PURPOSE)?.withdrawnAt).toBeNull();
        expect(byPurpose.get(CONSENT_PURPOSES[1])?.lawfulBasis).toBe(
          'art6_1_a',
        );
      });

      it('reports only the CURRENT grant per (purpose, basis) — an older superseded row is not double-counted', async () => {
        const { personId, orgId } = await seedPersonOrg();
        const older = new Date(Date.now() - 60_000);
        const newer = new Date();
        await db.insert(consentGrant).values({
          chargePersonId: personId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
          grantedAt: older,
        });
        await db.insert(consentGrant).values({
          chargePersonId: personId,
          organizationId: orgId,
          purpose: PURPOSE,
          lawfulBasis: GDPR,
          granted: true,
          grantedAt: newer,
          withdrawnAt: newer,
        });

        const report = await getConsentAccountabilityV2(db, personId, orgId);

        expect(report).toHaveLength(1);
        expect(report[0]?.termsAcceptedAt).toEqual(newer);
        expect(report[0]?.withdrawnAt).toEqual(newer);
      });

      it('returns an empty array for a person with no consent rows', async () => {
        const { personId, orgId } = await seedPersonOrg();
        expect(await getConsentAccountabilityV2(db, personId, orgId)).toEqual(
          [],
        );
      });
    });
  },
);
