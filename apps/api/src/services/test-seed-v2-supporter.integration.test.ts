/**
 * [WI-2241] `v2-supporter-accepted` seed — accepted-visibility fixture matrix
 * (real Neon DB, no internal mocks — GC1/GC6), mirroring the pattern proven
 * by supporter-visibility-authorization.integration.test.ts [WI-2237].
 *
 * The seed builder (test-seed-v2-supporter.ts) is excluded from
 * test-seed.test.ts's stateless-mock dispatch smoke test (it calls
 * db.transaction with read-after-write via initiateLink/acceptLink/
 * requestSelfUnlink, which the stateless mock cannot honestly model — see the
 * comment at that exclusion). This file is the real coverage: it runs the
 * actual seed builder against a real database and asserts, per AC, each
 * guaranteed property by name — never an adjacent/positive-only case while a
 * ruled absence sits unproven.
 */
import { resolve } from 'path';

import { loadDatabaseEnv } from '@eduagent/test-utils';
import { createDatabase, type Database } from '@eduagent/database';

import { ForbiddenError } from '../errors';
import { deleteOrganizationGraph } from './test-seed';
import { seedV2SupporterAccepted } from './test-seed-v2-supporter';
import { resolveScopesForPerson } from './scope-resolution';
import { readSupporteeStructuralSubjects } from './supporter-structural-mask';
import { readSharedRecordForSupportee } from './shared-record-read-model';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

function createIntegrationDb(): Database {
  return createDatabase(process.env.DATABASE_URL!);
}

(RUN ? describe : describe.skip)(
  '[WI-2241] v2-supporter-accepted seed — accepted-visibility fixture matrix (integration)',
  () => {
    let db: Database;
    let seeded: Awaited<ReturnType<typeof seedV2SupporterAccepted>>;

    beforeAll(async () => {
      db = createIntegrationDb();
      // No CLERK_SECRET_KEY in env — createClerkTestUser takes its documented
      // fake-ID fallback (SEED_CLERK_PREFIX + uuid), so this test never
      // touches the Clerk API, consistent with the DB-only integration tests
      // in this directory (test-seed.integration.test.ts).
      seeded = await seedV2SupporterAccepted(
        db,
        `wi2241-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
        {},
      );
    });

    afterAll(async () => {
      const orgIds = [
        seeded.accountId,
        seeded.ids.supporteeOrganizationId,
        seeded.ids.emptySupporteeOrganizationId,
        seeded.ids.revokedSupporteeOrganizationId,
      ].filter((id): id is string => !!id);
      await deleteOrganizationGraph(db, orgIds);
    });

    it('[AC: TRUTHFUL FIXTURE] returns supporter+supportee login credentials, person/edge/contract IDs, shared-record IDs, subject/topic/progress IDs, and the current (accepted) visibility status', () => {
      expect(seeded.email).toBeTruthy();
      expect(seeded.password).toBeTruthy();
      expect(seeded.ids.supporteeEmail).toBeTruthy();
      expect(seeded.ids.supporteePassword).toBeTruthy();
      expect(seeded.ids.supporterPersonId).toBeTruthy();
      expect(seeded.ids.supporteePersonId).toBeTruthy();
      expect(seeded.ids.edgeId).toBeTruthy();
      expect(seeded.ids.contractId).toBeTruthy();
      expect(seeded.ids.visibilityStatus).toBe('accepted');
      expect(seeded.ids.subjectId).toBeTruthy();
      expect(seeded.ids.topicId).toBeTruthy();
      expect(seeded.ids.retentionCardId).toBeTruthy();
      expect(seeded.ids.sessionSummaryId).toBeTruthy();
      expect(seeded.ids.weeklyReportId).toBeTruthy();
      expect(seeded.ids.milestoneId).toBeTruthy();
    });

    it('[AC: SETUP FAILS LOUDLY] resolveScopesForPerson resolves the real supporter shape (Support hub + the expected person chip), not the learner shape a legacy-guardianship substitute would produce', async () => {
      const scopes = await resolveScopesForPerson(
        db,
        seeded.ids.supporterPersonId,
      );
      expect(scopes.shape).toBe('supporter');
      if (scopes.shape !== 'supporter') return;
      expect(
        scopes.scopes.some((scope) => scope.kind === 'supporter-hub'),
      ).toBe(true);
      const personScope = scopes.scopes.find(
        (scope) =>
          scope.kind === 'person' &&
          scope.personId === seeded.ids.supporteePersonId,
      );
      expect(personScope).toBeDefined();
    });

    it('[AC: STRUCTURAL WALL] person Subjects surface returns the seeded structural subject/topic/progress and never leaks the private note/bookmark/transcript content anywhere in the payload', async () => {
      const structural = await readSupporteeStructuralSubjects(
        db,
        seeded.ids.supporterPersonId,
        seeded.ids.supporteePersonId,
      );
      expect(structural.subjects.map((subject) => subject.id)).toContain(
        seeded.ids.subjectId,
      );
      const topic = structural.subjects
        .flatMap((subject) => subject.books)
        .flatMap((book) => book.topics)
        .find((candidate) => candidate.id === seeded.ids.topicId);
      expect(topic).toBeDefined();
      expect(topic?.progressState).toBeTruthy();

      // Negative-wall containment check: the raw structural payload must
      // never carry the seeded private-artifact marker string anywhere,
      // not just in the fields this test happens to assert positively.
      const serialized = JSON.stringify(structural);
      expect(serialized).not.toContain('PRIVATE');
    });

    it('[AC: NEGATIVE WALL — shared record] the shared-record read model surfaces only shareable facts (weekly report / recap / milestone) and never the private note/bookmark/transcript content', async () => {
      const record = await readSharedRecordForSupportee(db, {
        supportershipId: seeded.ids.edgeId,
        supporterPersonId: seeded.ids.supporterPersonId,
        supporteePersonId: seeded.ids.supporteePersonId,
      });
      expect(record.supporterView.facts.length).toBeGreaterThan(0);

      const serialized = JSON.stringify(record);
      expect(serialized).not.toContain('PRIVATE');
    });

    it('[AC: NEGATIVE WALL — revoked edge fails closed] a revoked edge is absent from /scopes AND denies the structural-subjects read with no cached foreign data', async () => {
      const scopes = await resolveScopesForPerson(
        db,
        seeded.ids.supporterPersonId,
      );
      if (scopes.shape === 'supporter') {
        expect(
          scopes.scopes.some(
            (scope) =>
              scope.kind === 'person' &&
              scope.personId === seeded.ids.revokedSupporteePersonId,
          ),
        ).toBe(false);
      }

      await expect(
        readSupporteeStructuralSubjects(
          db,
          seeded.ids.supporterPersonId,
          seeded.ids.revokedSupporteePersonId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('[AC: NEGATIVE WALL — unauthorized deep-link] a personId the supporter has never linked to at all is denied identically (fails closed, not merely "not found")', async () => {
      // A syntactically valid UUID with no supportership row to this
      // supporter under any status.
      const unrelatedPersonId = '00000000-0000-7000-8000-000000000000';
      await expect(
        readSupporteeStructuralSubjects(
          db,
          seeded.ids.supporterPersonId,
          unrelatedPersonId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('[AC: EMPTY SHARED RECORD] an accepted edge with no shareable facts renders an honest empty state — not an error, and no private data leaked in its place', async () => {
      const structural = await readSupporteeStructuralSubjects(
        db,
        seeded.ids.supporterPersonId,
        seeded.ids.emptySupporteePersonId,
      );
      expect(structural.subjects).toEqual([]);

      const record = await readSharedRecordForSupportee(db, {
        supportershipId: seeded.ids.emptyEdgeId,
        supporterPersonId: seeded.ids.supporterPersonId,
        supporteePersonId: seeded.ids.emptySupporteePersonId,
      });
      expect(record.supporterView.facts).toEqual([]);
    });

    it('[AC: SCOPE JOURNEY — server-side identity stability] resolving scopes twice for the supporter returns the SAME edgeId for the rich supportee — the identity the client persists across tabs and relaunch (scope-context.tsx)', async () => {
      const first = await resolveScopesForPerson(
        db,
        seeded.ids.supporterPersonId,
      );
      const second = await resolveScopesForPerson(
        db,
        seeded.ids.supporterPersonId,
      );
      const firstPersonScope =
        first.shape === 'supporter'
          ? first.scopes.find(
              (scope) =>
                scope.kind === 'person' &&
                scope.personId === seeded.ids.supporteePersonId,
            )
          : undefined;
      const secondPersonScope =
        second.shape === 'supporter'
          ? second.scopes.find(
              (scope) =>
                scope.kind === 'person' &&
                scope.personId === seeded.ids.supporteePersonId,
            )
          : undefined;
      expect(firstPersonScope?.kind).toBe('person');
      expect(secondPersonScope?.kind).toBe('person');
      if (
        firstPersonScope?.kind === 'person' &&
        secondPersonScope?.kind === 'person'
      ) {
        expect(secondPersonScope.edgeId).toBe(firstPersonScope.edgeId);
      }
    });
  },
);
