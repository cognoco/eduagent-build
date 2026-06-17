// ---------------------------------------------------------------------------
// [WI-809] applyAnalysis GDPR gate — v2 flag-on path, integration against the
// real v2 consent graph on the post-M-DROP stg DB (legacy consent_states is
// DROPPED).
//
// The fix under test: applyAnalysis takes `opts?: { identityV2Enabled? }` and
// both GDPR gates (the outer pre-transaction gate AND the in-transaction TOCTOU
// re-check) route through isGdprProcessingAllowedV2 — the v2 consent-graph read
// — when flag-on, instead of the legacy isGdprProcessingAllowed that reads the
// dropped consent_states table.
//
// Seeded shape: a child person + membership (the org anchor isGdprProcessingAl-
// lowedV2 needs — without it the gate hits its "no org → allowed" branch and the
// test would be vacuous) + a WITHDRAWN GDPR consent_grant → processing NOT
// allowed → applyAnalysis returns {fieldsUpdated:[], notifications:[]} from the
// OUTER gate, before opening the transaction.
//
// Red-green-revert: revert the OUTER gate (learner-profile.ts:1350-1352) to the
// unconditional legacy `await isGdprProcessingAllowed(db, profileId)` → on the
// post-drop stg DB that reads consent_states → 500 (`relation "consent_states"
// does not exist`) → this test FAILS. Restore → GREEN.
//
// No internal jest.mock (GC1/GC6): the child/membership/grant are real v2 rows;
// a non-low-confidence analysis is passed so the outer gate is actually reached
// (confidence==='low' would short-circuit earlier and mask the gate).
//
// SCOPE NOTES:
//  - Non-vacuousness was verified on the post-M-DROP `-c stg` DB, where the RED
//    discriminator is a dropped-table 500. On a PRE-M-DROP DB (consent_states
//    still present) the reverted legacy read would instead find no GDPR row and
//    return [] via the memory-consent path, so a green there does NOT prove the
//    guard. Read a green from this test as meaningful only against a post-drop DB.
//  - This covers the OUTER gate only. The WITHDRAWN-from-start grant returns at
//    the outer gate before the transaction opens, so the in-transaction TOCTOU
//    re-check (the second isGdprProcessingAllowedV2 call) is NOT exercised —
//    doing so needs a mid-transaction consent mutation, impractical here.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import {
  consentGrant,
  createDatabase,
  learningProfiles,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import type { SessionAnalysisOutput } from '@eduagent/schemas';
import { applyAnalysis } from './learner-profile';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
// [WI-809] Gate on IDENTITY_POST_DROP=1: this suite is only NON-VACUOUS on a
// post-M-DROP DB. On a pre-drop DB the revert-the-fix proof (legacy
// isGdprProcessingAllowed reading the still-present consent_states) would NOT
// 500 and downstream memory gates could mask the difference, so the test could
// pass even with the fix broken. Gating it post-drop keeps it meaningful (it
// runs green on staging post-drop; auto-activates on CI once M-DROP lands).
// [review CodeRabbit L54]
const RUN =
  !!process.env.DATABASE_URL && process.env.IDENTITY_POST_DROP === '1';

function buildAnalysis(): SessionAnalysisOutput {
  // Non-low confidence so the outer GDPR gate is reached (confidence==='low'
  // short-circuits before any gate runs).
  return {
    explanationEffectiveness: null,
    interests: ['volcanoes'],
    strengths: null,
    struggles: null,
    resolvedTopics: null,
    communicationNotes: null,
    engagementLevel: null,
    confidence: 'high',
  };
}

(RUN ? describe : describe.skip)(
  'applyAnalysis v2 GDPR gate (integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterAll(async () => {
      // FK-safe order: grant → membership → person → organization.
      for (const pid of personIds) {
        await db
          .delete(consentGrant)
          .where(eq(consentGrant.chargePersonId, pid));
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(person).where(eq(person.id, pid));
      }
      for (const oid of orgIds) {
        await db.delete(organization).where(eq(organization.id, oid));
      }
      personIds.length = 0;
      orgIds.length = 0;
    });

    it('[BLOCK] flag-on: a WITHDRAWN GDPR grant blocks applyAnalysis via the v2 gate (no legacy consent_states row exists)', async () => {
      const [org] = await db
        .insert(organization)
        .values({ name: 'ApplyAnalysis V2 Org' })
        .returning();
      orgIds.push(org!.id);

      const [child] = await db
        .insert(person)
        .values({
          displayName: 'Child',
          birthDate: '2015-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(child!.id);

      // Membership = the org anchor isGdprProcessingAllowedV2 resolves consent
      // against. Load-bearing: without it the gate returns "allowed" (no-org
      // branch) and execution would proceed past the gate.
      await db.insert(membership).values({
        personId: child!.id,
        organizationId: org!.id,
        roles: ['learner'],
      });

      // WITHDRAWN GDPR grant → current GDPR state = WITHDRAWN → NOT allowed.
      await db.insert(consentGrant).values({
        chargePersonId: child!.id,
        organizationId: org!.id,
        purpose: 'platform_use',
        lawfulBasis: 'gdpr_parental_consent',
        granted: true,
        grantedAt: new Date(),
        withdrawnAt: new Date(),
      });

      // The fix: reads the v2 consent_grant (not the dropped consent_states), so
      // it does NOT throw, and the gate blocks the write.
      const result = await applyAnalysis(
        db,
        child!.id,
        buildAnalysis(),
        'Earth Science',
        'inferred',
        undefined,
        { identityV2Enabled: true },
      );

      expect(result).toEqual({ fieldsUpdated: [], notifications: [] });

      // [WI-809][review CodeRabbit L148] Prove the gate BLOCKED the write, not
      // merely returned an empty result: the outer GDPR gate short-circuits
      // BEFORE the transaction opens getOrCreateLearningProfileTx, so no
      // learning_profiles row exists for the child. Fails if gating regresses to
      // below the write.
      const written = await db.query.learningProfiles.findFirst({
        where: eq(learningProfiles.profileId, child!.id),
      });
      expect(written).toBeUndefined();
    });
  },
);
