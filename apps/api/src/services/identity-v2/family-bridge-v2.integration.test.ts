// ---------------------------------------------------------------------------
// WP-6 family-bridge-v2 — integration tests against the real identity graph +
// curriculum tables. These are the HIGH-severity authorization guards
// (enumeration §4.3–4.5): the parent→child (guardian→charge) access checks and
// the cross-person subject/topic data read.
//
// The legacy guards read `family_links` (parent_profile_id × child_profile_id)
// and join `subjects → profiles`. The v2 twins read the ratified `guardianship`
// edge (guardian_person_id × charge_person_id, revoked_at IS NULL = active) and
// join `subjects → person`. person.id = profiles.id throughout (canon
// data-model.md §2), so guardian/charge ids ARE the legacy parent/child profile
// ids unchanged.
//
// The central tests are the cross-guardian / cross-charge IDOR break tests:
//   - validateGuardianChargeRelationshipV2(A, charge-of-B) MUST throw.
//   - getChargeSubjectsForGuardianV2(A, charge-of-B, topic) MUST throw and
//     return NO subject data — the cross-person data-leak guard.
// Red-green-revert: against a guard that does not check the edge, these are RED
// (the unrelated guardian sees the other charge's data); with the active-edge
// check they are GREEN. The break-test revert evidence is recorded in the PR.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  guardianship,
  person,
  subjects,
  type Database,
} from '@eduagent/database';
import { ForbiddenError } from '../../errors';
import {
  getChargeSubjectsForGuardianV2,
  validateGuardianChargeRelationshipV2,
  validateGuardianshipEdgeV2,
} from './family-bridge-v2';
import {
  deleteLegacyAccountsForTest,
  ensureLegacyProfileAnchorForTest,
} from '../../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)(
  'family-bridge-v2 guards (integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      for (const pid of personIds) {
        // subjects → curricula/books/topics cascade on subject delete. Delete the
        // guardianship edges + subjects (which the v2 reads scope by person id),
        // then the person. subjects.profile_id FKs person(id) post-cutover.
        await db
          .delete(guardianship)
          .where(eq(guardianship.chargePersonId, pid));
        await db
          .delete(guardianship)
          .where(eq(guardianship.guardianPersonId, pid));
        await db.delete(subjects).where(eq(subjects.profileId, pid));
        await deleteLegacyAccountsForTest(db, [pid]);
        await db.delete(person).where(eq(person.id, pid));
      }
      personIds.length = 0;
    });

    /**
     * Seed a person. subjects.profile_id FKs person(id) post-cutover (the legacy
     * profiles/accounts tables are dropped), so the person id is the subject-owner
     * scope key directly; no legacy backing rows are needed.
     */
    async function seedPerson(
      name: string,
      birthDate = '2012-01-01',
    ): Promise<string> {
      const [p] = await db
        .insert(person)
        .values({ displayName: name, birthDate, residenceJurisdiction: 'EU' })
        .returning();
      const personId = p!.id;
      personIds.push(personId);
      await ensureLegacyProfileAnchorForTest(db, {
        profileId: personId,
        displayName: name,
        birthYear: Number(birthDate.slice(0, 4)),
      });
      return personId;
    }

    async function grantEdge(
      guardianId: string,
      chargeId: string,
    ): Promise<string> {
      const [edge] = await db
        .insert(guardianship)
        .values({ guardianPersonId: guardianId, chargePersonId: chargeId })
        .returning();
      return edge!.id;
    }

    /** Seed a subject + curriculum + book + one topic owned by `ownerPersonId`. */
    async function seedTopic(
      ownerPersonId: string,
      opts?: { subjectName?: string; topicTitle?: string },
    ): Promise<string> {
      const [subject] = await db
        .insert(subjects)
        .values({
          profileId: ownerPersonId,
          name: opts?.subjectName ?? 'Mathematics',
          languageCode: 'en',
        })
        .returning();
      const [curriculum] = await db
        .insert(curricula)
        .values({ subjectId: subject!.id, version: 1 })
        .returning();
      const [book] = await db
        .insert(curriculumBooks)
        .values({ subjectId: subject!.id, title: 'Algebra I', sortOrder: 0 })
        .returning();
      const [topic] = await db
        .insert(curriculumTopics)
        .values({
          curriculumId: curriculum!.id,
          bookId: book!.id,
          title: opts?.topicTitle ?? 'Linear equations',
          description: 'Solving for x in linear equations.',
          sortOrder: 0,
          estimatedMinutes: 20,
        })
        .returning();
      return topic!.id;
    }

    // -------------------------------------------------------------------------
    // validateGuardianshipEdgeV2 — the boolean edge check (§4.3).
    // -------------------------------------------------------------------------

    it('validateGuardianshipEdgeV2 is true for an active edge, false after revoke', async () => {
      const guardian = await seedPerson('Guardian');
      const charge = await seedPerson('Charge');
      const edgeId = await grantEdge(guardian, charge);

      expect(await validateGuardianshipEdgeV2(db, guardian, charge)).toBe(true);

      await db
        .update(guardianship)
        .set({ revokedAt: new Date() })
        .where(eq(guardianship.id, edgeId));
      expect(await validateGuardianshipEdgeV2(db, guardian, charge)).toBe(
        false,
      );
    });

    it('[BREAK] validateGuardianshipEdgeV2 is false across an unrelated guardian/charge pair', async () => {
      const guardianA = await seedPerson('GuardianA');
      const guardianB = await seedPerson('GuardianB');
      const chargeOfB = await seedPerson('ChargeOfB');
      await grantEdge(guardianB, chargeOfB);

      // Guardian A holds NO edge over B's charge → false. A guard that does not
      // scope to the (guardian, charge) pair would return true (cross-guardian leak).
      expect(await validateGuardianshipEdgeV2(db, guardianA, chargeOfB)).toBe(
        false,
      );
    });

    // -------------------------------------------------------------------------
    // validateGuardianChargeRelationshipV2 — the assert form (§4.4).
    // -------------------------------------------------------------------------

    it('validateGuardianChargeRelationshipV2 resolves for an active edge', async () => {
      const guardian = await seedPerson('Guardian');
      const charge = await seedPerson('Charge');
      await grantEdge(guardian, charge);

      await expect(
        validateGuardianChargeRelationshipV2(db, guardian, charge),
      ).resolves.toBeUndefined();
    });

    it('[BREAK] validateGuardianChargeRelationshipV2 throws ForbiddenError across guardians (cross-guardian IDOR)', async () => {
      const guardianA = await seedPerson('GuardianA');
      const guardianB = await seedPerson('GuardianB');
      const chargeOfB = await seedPerson('ChargeOfB');
      await grantEdge(guardianB, chargeOfB);

      // The core authorization break test: an unrelated guardian must be denied.
      // A guard short-circuited to always-resolve would let A through → IDOR.
      await expect(
        validateGuardianChargeRelationshipV2(db, guardianA, chargeOfB),
      ).rejects.toThrow(ForbiddenError);
    });

    // -------------------------------------------------------------------------
    // getChargeSubjectsForGuardianV2 — the cross-person data read (§4.5).
    // -------------------------------------------------------------------------

    it('getChargeSubjectsForGuardianV2 returns the charge topic snapshot for a linked guardian', async () => {
      const guardian = await seedPerson('Guardian');
      const charge = await seedPerson('Charge', '2013-06-01');
      await grantEdge(guardian, charge);
      const topicId = await seedTopic(charge);

      const snapshot = await getChargeSubjectsForGuardianV2(
        db,
        guardian,
        charge,
        topicId,
      );
      expect(snapshot).not.toBeNull();
      expect(snapshot!.childProfileId).toBe(charge);
      expect(snapshot!.childDisplayName).toBe('Charge');
      expect(snapshot!.subjectName).toBe('Mathematics');
      expect(snapshot!.topicTitle).toBe('Linear equations');
      // birthYear 2013 → age ≤ 15 bracket
      expect(snapshot!.sourceAgeBracket).toBe('thirteen_fifteen');
    });

    it('[BREAK] getChargeSubjectsForGuardianV2 throws and returns NO data for an unrelated guardian (cross-person data leak)', async () => {
      const guardianA = await seedPerson('GuardianA');
      const guardianB = await seedPerson('GuardianB');
      const chargeOfB = await seedPerson('ChargeOfB');
      await grantEdge(guardianB, chargeOfB);
      const topicOfB = await seedTopic(chargeOfB);

      // THE cross-person data-leak guard: guardian A (no edge to B's charge) must
      // be denied BEFORE any subject row is exposed. A read that skips the edge
      // check would return B's charge's topic data to A.
      await expect(
        getChargeSubjectsForGuardianV2(db, guardianA, chargeOfB, topicOfB),
      ).rejects.toThrow(ForbiddenError);
    });

    it('getChargeSubjectsForGuardianV2 returns null when the topic is not the charge’s own', async () => {
      const guardian = await seedPerson('Guardian');
      const charge = await seedPerson('Charge');
      await grantEdge(guardian, charge);
      // A topic owned by the GUARDIAN, not the charge. The read is scoped to the
      // charge's subjects, so it resolves null (topic exists but not under charge).
      const guardianOwnTopic = await seedTopic(guardian, {
        subjectName: 'History',
        topicTitle: 'Rome',
      });

      const snapshot = await getChargeSubjectsForGuardianV2(
        db,
        guardian,
        charge,
        guardianOwnTopic,
      );
      expect(snapshot).toBeNull();
    });
  },
);
