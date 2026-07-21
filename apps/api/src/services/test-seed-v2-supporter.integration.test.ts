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
 *
 * NOTE on the PRIVATE-marker `.not.toContain('PRIVATE')` checks below: those
 * are forward-regression CANARIES, not authorization proofs — the structural
 * and shared-record read models never select the private-artifact tables in
 * the first place, so the checks cannot fail for an authorization bug (see
 * the per-test comments). The actual NEGATIVE WALL property — a
 * revoked/unauthorized caller is denied outright, not served foreign data —
 * is proven by the ForbiddenError assertions on the revoked-edge and
 * unauthorized-deep-link cases.
 */
import { resolve } from 'path';
import { eq, inArray } from 'drizzle-orm';

import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  login,
  person,
  supportVisibilityContracts,
  supportership,
  type Database,
} from '@eduagent/database';
import { profileListResponseSchema } from '@eduagent/schemas';

import { buildIntegrationEnv } from '../../../../tests/integration/helpers';
import { buildAuthHeaders } from '../../../../tests/integration/route-fixtures';
import {
  addFetchHandler,
  installFetchInterceptor,
  restoreFetch,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';

import { ForbiddenError } from '../errors';
import { app } from '../index';
import { clearJWKSCache } from '../middleware/jwt';
import { deleteOrganizationGraph } from './test-seed';
import {
  seedV2SupporterAccepted,
  seedV2SupporterManaged,
  seedV2SupporterPendingLink,
  seedV2SupporterSelfLearningActive,
} from './test-seed-v2-supporter';
import { acceptLink } from './linking-ceremony';
import { resolveScopesForPerson } from './scope-resolution';
import { readSupporteeStructuralSubjects } from './supporter-structural-mask';
import { readSharedRecordForSupportee } from './shared-record-read-model';
import { resolveSupporterColdStart } from './supporter-coldstart';
import { getPersonScope } from './identity-v2/profile-v2';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;
const nativeFetch = globalThis.fetch;

if (RUN) {
  installFetchInterceptor();
  mockClerkJWKS();
  addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));
}

afterAll(() => {
  if (RUN) restoreFetch();
});

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

    it('[AC: STRUCTURAL WALL] person Subjects surface returns the seeded structural subject/topic/progress, and its response shape has no field for note/session content at all', async () => {
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
      // The response is parsed through supporteeStructuralSubjectsResponseSchema
      // (supporter-structural-mask.ts), whose subject/book/topic shape has no
      // note/session-content field at all — the structural wall is a type-level
      // guarantee of THIS response, not something this test proves at runtime.

      // [Phase-4 review, WI-2241] This is a forward-regression CANARY, not an
      // authorization proof: readSupporteeStructuralSubjects never SELECTs
      // topicNotes/bookmarks/sessionEvents/learningProfiles in the first
      // place (supporter-structural-mask.ts's query joins only
      // subjects/curriculumBooks/curriculumTopics/retentionCards), so this
      // assertion cannot fail for an authorization bug — it exists to trip
      // immediately if a future change widens that query or the response
      // schema to reach into a private table. The actual NEGATIVE WALL
      // property (an unauthorized/revoked caller is denied, not served
      // foreign data) is proven by the ForbiddenError cases below, not here.
      const serialized = JSON.stringify(structural);
      expect(serialized).not.toContain('PRIVATE');
    });

    it('[AC-5 canary] the shared-record read model surfaces only shareable facts (weekly report / recap / milestone), and a forward-regression canary confirms its payload never carries the private-artifact marker', async () => {
      const record = await readSharedRecordForSupportee(db, {
        supportershipId: seeded.ids.edgeId,
        supporterPersonId: seeded.ids.supporterPersonId,
        supporteePersonId: seeded.ids.supporteePersonId,
      });
      expect(record.supporterView.facts.length).toBeGreaterThan(0);

      // [Phase-4 review, WI-2241] Same canary caveat as the structural-wall
      // case above: readSharedRecordForSupportee (shared-record-read-model.ts)
      // only ever queries weeklyReports/sessionSummaries/milestones — it never
      // selects topicNotes/bookmarks/sessionEvents/learningProfiles, so this
      // check cannot fail for an authorization bug. It is a regression guard
      // against a future change widening that read model, not the NEGATIVE
      // WALL proof itself — that proof is the revoked-edge and
      // unauthorized-deep-link ForbiddenError cases below.
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

/**
 * [WI-2226 owner-gate corroboration] `v2-supporter-managed` seed — the
 * SAME-ORG managed cold-start candidate the owner-gate fix (supporter-
 * coldstart.ts) actually renders. `v2-supporter-accepted` above cannot
 * exercise the `managed` card: its supportees are each an independent v2
 * owner in their OWN organization (cross-org), which the owner-gate
 * suppresses. This corroborates the seed E2E journeys (j31 Playwright,
 * v2-supporter-coldstart-mount.yaml Maestro) rely on, against a real DB —
 * those specs are disclosed-unexecuted (no emulator/staging device reachable
 * in this build environment); this integration test IS runnable here and is
 * the real proof the seed produces what those specs assert.
 */
(RUN ? describe : describe.skip)(
  '[WI-2226 owner-gate corroboration] v2-supporter-managed seed — same-org managed cold-start candidate (integration)',
  () => {
    let db: Database;
    let seeded: Awaited<ReturnType<typeof seedV2SupporterManaged>>;
    const env = RUN ? buildIntegrationEnv() : {};

    beforeAll(async () => {
      db = createIntegrationDb();
      seeded = await seedV2SupporterManaged(
        db,
        `wi2226-managed-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
        {},
      );
    });

    afterAll(async () => {
      await deleteOrganizationGraph(db, [seeded.accountId]);
    });

    it('[AC: TRUTHFUL FIXTURE] seeds a same-org supporter + managed child with a real supportership edge', () => {
      expect(seeded.email).toBeTruthy();
      expect(seeded.password).toBeTruthy();
      expect(seeded.ids.supporterPersonId).toBeTruthy();
      expect(seeded.ids.supporterOrganizationId).toBe(seeded.accountId);
      expect(seeded.ids.managedChildPersonId).toBeTruthy();
      expect(seeded.ids.managedChildEdgeId).toBeTruthy();
    });

    it('[WI-2584 route boundary] authenticated GET /v1/profiles returns the schema-valid supporter owner and same-org Managed Child', async () => {
      const supporterLogin = await db.query.login.findFirst({
        where: eq(login.personId, seeded.ids.supporterPersonId),
        columns: { clerkUserId: true },
      });

      expect(supporterLogin).toBeDefined();

      clearJWKSCache();
      const response = await app.request(
        '/v1/profiles',
        {
          headers: buildAuthHeaders({
            sub: supporterLogin!.clerkUserId,
            email: seeded.email,
            email_verified: true,
          }),
        },
        env,
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      const parsed = profileListResponseSchema.parse(body);
      expect(parsed.profiles).toHaveLength(2);
      expect(parsed.profiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: seeded.ids.supporterPersonId,
            displayName: 'Test Supporter',
            isOwner: true,
          }),
          expect.objectContaining({
            id: seeded.ids.managedChildPersonId,
            displayName: 'Managed Child',
            isOwner: false,
          }),
        ]),
      );
    });

    it("[AC: SAME-ORG] the managed child resolves within the supporter's own organization — the exact predicate POST /profiles/switch (getPersonScope) enforces", async () => {
      const scope = await getPersonScope(
        db,
        seeded.ids.managedChildPersonId,
        seeded.ids.supporterOrganizationId,
      );
      expect(scope).not.toBeNull();
    });

    it('[AC: OWNER-GATED MANAGED CARD] resolveSupporterColdStart renders the managed card for the seeded child — the state j31 / v2-supporter-coldstart-mount.yaml assert', async () => {
      const result = await resolveSupporterColdStart(
        db,
        seeded.ids.supporterPersonId,
      );
      expect(result.variant).toBe('per-child');
      if (result.variant !== 'per-child') return;
      const card = result.cards.find(
        (c) => c.personId === seeded.ids.managedChildPersonId,
      );
      expect(card).toMatchObject({
        personId: seeded.ids.managedChildPersonId,
        edgeId: seeded.ids.managedChildEdgeId,
        displayName: 'Managed Child',
        state: 'managed',
        anchor: 'handoff',
      });
    });
  },
);

/**
 * [WI-2243] `v2-supporter-self-learning-active` seed — the self-learning
 * doorway + Me-scope persistence fixture. AC-4's "existing server-side
 * authorization is the enforcement boundary" requirement, exercised against
 * a real DB rather than asserted only via client-side scope filtering.
 *
 * The doorway itself introduces no new server read path — it only switches
 * the mobile client's active scope and lets the supporter reach the
 * ordinary learner Mentor flow, which writes/reads through the SAME
 * profileId-scoped endpoints any learner uses. The isolation guarantee is
 * therefore the two boundaries that already exist and are unchanged by this
 * WI:
 *
 *   1. Person-scope reads (readSupporteeStructuralSubjects /
 *      readSharedRecordForSupportee) are always queried by the SUPPORTEE's
 *      personId — a supporter's own Me-scope subject can never be a
 *      candidate row.
 *   2. `getPersonScope` (the exact predicate profileScopeMiddleware runs
 *      for every `X-Profile-Id` header) never resolves the supportee as a
 *      profile on the supporter's own organization — the supporter cannot
 *      reach the supportee's data by any Me-scope-authorized request, no
 *      matter what personId the client sent.
 */
(RUN ? describe : describe.skip)(
  '[WI-2243] v2-supporter-self-learning-active seed — Me-scope isolation (integration)',
  () => {
    let db: Database;
    let seeded: Awaited<ReturnType<typeof seedV2SupporterSelfLearningActive>>;

    beforeAll(async () => {
      db = createIntegrationDb();
      seeded = await seedV2SupporterSelfLearningActive(
        db,
        `wi2243-selflearn-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
        {},
      );
    });

    afterAll(async () => {
      // [Phase-4 review] The supportee here is an INDEPENDENT v2 owner
      // identity in its own organization (same shape as
      // seedV2SupporterAccepted's supportees, unlike seedV2SupporterManaged's
      // same-org managed child above) — cleaning up only seeded.accountId
      // would leak the supportee's org + Clerk test user on every run.
      await deleteOrganizationGraph(db, [
        seeded.accountId,
        seeded.ids.supporteeOrganizationId,
      ]);
    });

    it("[AC: TRUTHFUL FIXTURE] seeds an accepted supportee edge plus a real subject+session on the supporter's own personId", () => {
      expect(seeded.ids.supporterPersonId).toBeTruthy();
      expect(seeded.ids.supporteePersonId).toBeTruthy();
      expect(seeded.ids.edgeId).toBeTruthy();
      expect(seeded.ids.ownSubjectId).toBeTruthy();
      expect(seeded.ids.ownSessionId).toBeTruthy();
    });

    it("[AC-3 server corroboration] resolveScopesForPerson lists 'me' once the supporter has real learning state of their own", async () => {
      const scopeList = await resolveScopesForPerson(
        db,
        seeded.ids.supporterPersonId,
      );
      expect(scopeList.shape).toBe('supporter');
      if (scopeList.shape !== 'supporter') return;
      expect(scopeList.scopes.some((scope) => scope.kind === 'me')).toBe(true);
    });

    // [Phase-4 review] Same canary caveat as the WI-2237/WI-2241 checks above
    // (see file header + the `[AC: STRUCTURAL WALL]` test): these direction-1
    // checks are forward-regression CANARIES, not authorization proofs.
    // `readSupporteeStructuralSubjects` filters on `subjects.profileId =
    // supporteePersonId` (supporter-structural-mask.ts) and
    // `readSharedRecordForSupportee` never queries the `subjects` table at
    // all (shared-record-read-model.ts) — the supporter's own Me-scope
    // subject is structurally unreachable by either query regardless of any
    // authorization bug, so neither check can fail for one. They exist to
    // trip immediately if a future change widens either query/response shape
    // to reach into the caller's own Me-scope data. AC-4 direction 1's actual
    // guarantee is the query scoping itself (cited above), not something a
    // runtime assertion over today's code can independently prove.
    it("[AC-4 direction 1 canary] the supporter's own Me-scope subject never appears in the supportee's person-scope structural read", async () => {
      const result = await readSupporteeStructuralSubjects(
        db,
        seeded.ids.supporterPersonId,
        seeded.ids.supporteePersonId,
      );
      expect(
        result.subjects.some((s) => s.id === seeded.ids.ownSubjectId),
      ).toBe(false);
      expect(
        result.subjects.some((s) => s.name === 'Supporter Own Subject'),
      ).toBe(false);
    });

    it("[AC-4 direction 1 canary] the supporter's own Me-scope subject never appears in the supportee's shared-record read", async () => {
      const record = await readSharedRecordForSupportee(db, {
        supportershipId: seeded.ids.edgeId,
        supporterPersonId: seeded.ids.supporterPersonId,
        supporteePersonId: seeded.ids.supporteePersonId,
      });
      expect(
        record.supporterView.facts.some(
          (fact) => fact.title === 'Supporter Own Subject',
        ),
      ).toBe(false);
    });

    it("[AC-4 direction 2] the supportee never resolves as a profile on the supporter's own organization — the exact predicate profileScopeMiddleware runs for every X-Profile-Id header, so no Me-scope-authorized request can reach the supportee's data", async () => {
      const scope = await getPersonScope(
        db,
        seeded.ids.supporteePersonId,
        seeded.ids.supporterOrganizationId,
      );
      expect(scope).toBeNull();
    });
  },
);

/**
 * [WI-2242] `v2-supporter-pending-link` seed — the pre-acceptance visibility-
 * contract fixture the link-ceremony's integration matrix needs. Every seed
 * above reaches 'accepted' via `seedAcceptedEdge`; this one is stopped after
 * `initiateLink` alone, so the NO-EARLY-AUTH boundary
 * (`acceptedVisibilityCondition`, linking-ceremony.ts) can be proven BEFORE
 * either side accepts, and the pending -> accepted transition can be driven
 * inline through the real `acceptLink` write path — the same production code
 * the UI's accept button (`ContractCard`'s `visibility-contract-accept`)
 * calls. This is the real, DB-backed proof behind the (author-only, never
 * executed — no dev-server/staging DB reachable in this build environment)
 * J-33 Playwright spec and `v2-supporter-link-ceremony.yaml` Maestro flow.
 *
 * Recovery variants, per AC ("reject/expired/revoked/restamped/foreign-
 * link/duplicate" recovery coverage): "revoked"/"restamped" are already
 * proven generically by supporter-visibility-authorization.integration.test.ts
 * (seedRevoked/seedRestamped); this file covers the three variants specific
 * to THIS fixture's pending contract — foreign/invalid deep-link,
 * duplicate accept, and expired/lapsed (see the dedicated test below for the
 * "expiry transition is unimplemented in production" caveat).
 */
(RUN ? describe : describe.skip)(
  '[WI-2242] v2-supporter-pending-link seed — link-ceremony state matrix (integration)',
  () => {
    let db: Database;
    let seeded: Awaited<ReturnType<typeof seedV2SupporterPendingLink>>;

    beforeAll(async () => {
      db = createIntegrationDb();
      seeded = await seedV2SupporterPendingLink(
        db,
        `wi2242-pending-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
        {},
      );
    });

    afterAll(async () => {
      // [Phase-4 review pattern, same as the WI-2241/WI-2243 blocks above]
      // The supportee is an INDEPENDENT v2 owner identity in its own
      // organization — cleaning up only seeded.accountId would leak the
      // supportee's org + Clerk test user on every run.
      await deleteOrganizationGraph(db, [
        seeded.accountId,
        seeded.ids.supporteeOrganizationId,
      ]);
    });

    it('[AC: TRUTHFUL FIXTURE] returns supporter+supportee credentials, person/edge/contract IDs, and a pending (not yet accepted) visibility status', () => {
      expect(seeded.email).toBeTruthy();
      expect(seeded.password).toBeTruthy();
      expect(seeded.ids.supporteeEmail).toBeTruthy();
      expect(seeded.ids.supporteePassword).toBeTruthy();
      expect(seeded.ids.supporterPersonId).toBeTruthy();
      expect(seeded.ids.supporteePersonId).toBeTruthy();
      expect(seeded.ids.edgeId).toBeTruthy();
      expect(seeded.ids.contractId).toBeTruthy();
      expect(seeded.ids.visibilityStatus).toBe('pending');
      expect(seeded.ids.contractVersion).toBe('1');
      expect(seeded.ids.relation).toBe('other');
    });

    // [AC: NO-EARLY-AUTH boundary] + [AC: CEREMONY — pending -> accepted] are
    // merged into one test, in this order, deliberately: both exercise the
    // SAME shared `seeded` contract (mutating it pending -> accepted), so
    // splitting them into separate `it` blocks would make the boundary
    // assertion's correctness depend on Jest's within-file declaration order
    // rather than on an explicit before/after within one test body — the
    // precedent this file follows
    // (supporter-visibility-authorization.integration.test.ts) avoids that
    // coupling entirely by seeding fresh per-`it`. Merging removes the
    // ordering hazard without needing a second seed call per test.
    it('[AC: NO-EARLY-AUTH boundary + AC: CEREMONY] a pending (never-accepted) contract grants no person scope and no structural read; driving acceptLink for the supportee then the supporter flips status to accepted and opens the person scope — the same real write path the UI accept button calls', async () => {
      const scopesBefore = await resolveScopesForPerson(
        db,
        seeded.ids.supporterPersonId,
      );
      expect(scopesBefore.shape).toBe('learner');

      await expect(
        readSupporteeStructuralSubjects(
          db,
          seeded.ids.supporterPersonId,
          seeded.ids.supporteePersonId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const afterSupportee = await acceptLink(db, seeded.ids.contractId, {
        actorPersonId: seeded.ids.supporteePersonId,
        audience: 'supportee',
      });
      expect(afterSupportee.status).toBe('pending'); // one-sided — not yet both.

      const afterSupporter = await acceptLink(db, seeded.ids.contractId, {
        actorPersonId: seeded.ids.supporterPersonId,
        audience: 'supporter',
      });
      expect(afterSupporter.status).toBe('accepted');

      const scopesAfter = await resolveScopesForPerson(
        db,
        seeded.ids.supporterPersonId,
      );
      expect(scopesAfter.shape).toBe('supporter');
      if (scopesAfter.shape !== 'supporter') return;
      expect(
        scopesAfter.scopes.some(
          (scope) =>
            scope.kind === 'person' &&
            scope.personId === seeded.ids.supporteePersonId,
        ),
      ).toBe(true);
    });

    it('[AC recovery — foreign/invalid deep link] an unrelated actorPersonId attempting to accept either side of this contract is rejected, not silently accepted', async () => {
      // A syntactically valid UUID with no relationship to this contract at
      // all — same "unrelated caller" shape as the WI-2241 unauthorized
      // deep-link case above.
      const unrelatedPersonId = '00000000-0000-7000-8000-000000000000';
      await expect(
        acceptLink(db, seeded.ids.contractId, {
          actorPersonId: unrelatedPersonId,
          audience: 'supporter',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        acceptLink(db, seeded.ids.contractId, {
          actorPersonId: unrelatedPersonId,
          audience: 'supportee',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('[AC recovery — duplicate accept] re-accepting the same side twice is idempotent — recomputes the same accepted state rather than erroring or double-writing', async () => {
      const first = await acceptLink(db, seeded.ids.contractId, {
        actorPersonId: seeded.ids.supporterPersonId,
        audience: 'supporter',
      });
      const second = await acceptLink(db, seeded.ids.contractId, {
        actorPersonId: seeded.ids.supporterPersonId,
        audience: 'supporter',
      });
      expect(second.status).toBe(first.status);
      expect(second.supporterAcceptedAt).toBeTruthy();
    });

    it('[AC recovery — expired/lapsed invite fails closed] a lapsed contract denies scope and structural read identically to pending/revoked — proving the fail-closed PROPERTY the AC requires, even though the expiry TRANSITION itself is unimplemented in production', async () => {
      // [WI-2242 map Q2, verified against source] `lapsed` is a valid
      // status-enum member (CHECK constraint,
      // packages/database/src/schema/visibility-contract.ts) but nothing in
      // apps/packages ever SETS it — there is no `expiresAt` column and no
      // lapse job/transition anywhere in the codebase, so raw insert is the
      // only producer (same convention as
      // supporter-visibility-authorization.integration.test.ts's own
      // seedLapsed). This test proves the boundary predicate
      // (acceptedVisibilityCondition) rejects a lapsed contract exactly like
      // it rejects pending/revoked — it does NOT and cannot prove an expiry
      // transition, because none exists to prove.
      const now = new Date();
      const [lapsedSupporter] = await db
        .insert(person)
        .values({
          displayName: 'WI-2242 Lapsed Supporter',
          birthDate: '1985-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      const [lapsedSupportee] = await db
        .insert(person)
        .values({
          displayName: 'WI-2242 Lapsed Supportee',
          birthDate: '2010-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      const [edge] = await db
        .insert(supportership)
        .values({
          supporterPersonId: lapsedSupporter!.id,
          supporteePersonId: lapsedSupportee!.id,
          grantedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await db.insert(supportVisibilityContracts).values({
        supportershipId: edge!.id,
        supporterPersonId: lapsedSupporter!.id,
        supporteePersonId: lapsedSupportee!.id,
        relation: 'other',
        status: 'lapsed',
        contractVersion: 1,
        reportableKinds: ['mastery'],
        artifactWall: true,
        renderEquivalence: true,
        safetyException: true,
        supporterAcceptedAt: now,
        supporteeAcceptedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      try {
        const scopes = await resolveScopesForPerson(db, lapsedSupporter!.id);
        expect(scopes.shape).toBe('learner');

        await expect(
          readSupporteeStructuralSubjects(
            db,
            lapsedSupporter!.id,
            lapsedSupportee!.id,
          ),
        ).rejects.toBeInstanceOf(ForbiddenError);
      } finally {
        await db
          .delete(supportVisibilityContracts)
          .where(eq(supportVisibilityContracts.supportershipId, edge!.id));
        await db.delete(supportership).where(eq(supportership.id, edge!.id));
        await db
          .delete(person)
          .where(
            inArray(person.id, [lapsedSupporter!.id, lapsedSupportee!.id]),
          );
      }
    });
  },
);
