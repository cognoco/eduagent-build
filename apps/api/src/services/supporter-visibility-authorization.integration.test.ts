/**
 * [WI-2237] Authorization-matrix regression suite — supporter scope and
 * structural reads must be gated on an ACCEPTED visibility contract, not
 * merely a non-revoked `supportership` edge.
 *
 * `resolveScopesForPerson` (`scope-resolution.ts`) and
 * `readSupporteeStructuralSubjects` (`supporter-structural-mask.ts`) both
 * previously authorized on `isNull(supportership.revokedAt)` alone. Every
 * variant below is a state where the edge is non-revoked but the visibility
 * contract has NOT reached `status='accepted'` with both parties' acceptance
 * recorded — under the pre-fix code, all of them leaked person scope +
 * structural learning data.
 *
 * RGR (required by the AC): the 'pending' case below —
 * "denies person scope and masks structural reads when the visibility
 * contract is pending, not accepted [WI-2237] [RGR]" — is the canonical
 * red/green/revert regression guard. It was watched RED against the
 * pre-fix `isNull(supportership.revokedAt)`-only predicate (both functions
 * returned/exposed data for a merely-initiated, never-accepted link), GREEN
 * after applying `acceptedVisibilityCondition()`, then the fix was reverted
 * to re-confirm RED before being restored. See PR description / commit
 * history for the executed cycle; this file is the durable, committed
 * guard going forward.
 *
 * Real Neon DB (staging), no internal mocks — seeds through the actual
 * `initiateLink` / `acceptLink` / `restampGraduationContracts` /
 * `requestSelfUnlink` write paths wherever a variant has one, matching the
 * `visibility.integration.test.ts` convention of never fabricating an
 * 'accepted' row via raw insert. Raw insert is used only for `lapsed`,
 * which has no current producer (schema-valid, future status).
 */

import { resolve } from 'path';
import { eq } from 'drizzle-orm';

import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  person,
  subjects,
  supportVisibilityAuditEvents,
  supportVisibilityContracts,
  supportVisibilityNotices,
  supportership,
  type Database,
} from '@eduagent/database';

import { ForbiddenError } from '../errors';
import {
  acceptLink,
  initiateLink,
  type VisibilityContract,
} from './linking-ceremony';
import { restampGraduationContracts } from './graduation-narration';
import { requestSelfUnlink } from './supportership-revocation';
import { resolveScopesForPerson } from './scope-resolution';
import { readSupporteeStructuralSubjects } from './supporter-structural-mask';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
const RUN = !!process.env.DATABASE_URL;

const NOW = new Date('2026-06-29T12:00:00.000Z');

function createIntegrationDb(): Database {
  return createDatabase(process.env.DATABASE_URL!);
}

(RUN ? describe : describe.skip)(
  'supporter scope + structural-read authorization matrix (integration) [WI-2237]',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const supportershipIds: string[] = [];
    const subjectIds: string[] = [];

    beforeAll(() => {
      db = createIntegrationDb();
    });

    afterEach(async () => {
      for (const subjectId of subjectIds) {
        await db.delete(subjects).where(eq(subjects.id, subjectId));
      }
      subjectIds.length = 0;
      for (const sid of supportershipIds) {
        await db
          .delete(supportVisibilityNotices)
          .where(eq(supportVisibilityNotices.supportershipId, sid));
        await db
          .delete(supportVisibilityAuditEvents)
          .where(eq(supportVisibilityAuditEvents.supportershipId, sid));
        await db
          .delete(supportVisibilityContracts)
          .where(eq(supportVisibilityContracts.supportershipId, sid));
        await db.delete(supportership).where(eq(supportership.id, sid));
      }
      for (const pid of personIds) {
        await db.delete(person).where(eq(person.id, pid));
      }
      supportershipIds.length = 0;
      personIds.length = 0;
    });

    async function seedTwoPersons(
      label: string,
    ): Promise<{ supporterId: string; supporteeId: string }> {
      const [supporter] = await db
        .insert(person)
        .values({
          displayName: `${label} Supporter`,
          birthDate: '1985-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      const [supportee] = await db
        .insert(person)
        .values({
          displayName: `${label} Supportee`,
          birthDate: '2010-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning();
      personIds.push(supporter!.id, supportee!.id);
      return { supporterId: supporter!.id, supporteeId: supportee!.id };
    }

    async function seedPending(label: string): Promise<{
      supporterId: string;
      supporteeId: string;
      contract: VisibilityContract;
    }> {
      const { supporterId, supporteeId } = await seedTwoPersons(label);
      const contract = await initiateLink(db, {
        supporterPersonId: supporterId,
        supporteePersonId: supporteeId,
        relation: 'other',
        managedTier: false,
        managedTierActive: false,
        now: NOW,
      });
      supportershipIds.push(contract.supportershipId);
      expect(contract.status).toBe('pending');
      return { supporterId, supporteeId, contract };
    }

    async function seedOneSided(label: string): Promise<{
      supporterId: string;
      supporteeId: string;
      contract: VisibilityContract;
    }> {
      const seeded = await seedPending(label);
      const contract = await acceptLink(db, seeded.contract.id, {
        actorPersonId: seeded.supporterId,
        audience: 'supporter',
        now: NOW,
      });
      expect(contract.status).toBe('pending');
      return { ...seeded, contract };
    }

    async function seedAccepted(label: string): Promise<{
      supporterId: string;
      supporteeId: string;
      contract: VisibilityContract;
    }> {
      const seeded = await seedOneSided(label);
      const contract = await acceptLink(db, seeded.contract.id, {
        actorPersonId: seeded.supporteeId,
        audience: 'supportee',
        now: NOW,
      });
      expect(contract.status).toBe('accepted');
      return { ...seeded, contract };
    }

    async function seedRevoked(label: string): Promise<{
      supporterId: string;
      supporteeId: string;
      contract: VisibilityContract;
    }> {
      const seeded = await seedAccepted(label);
      await requestSelfUnlink(db, {
        supportershipId: seeded.contract.supportershipId,
        callerPersonId: seeded.supporteeId,
        now: NOW,
      });
      return seeded;
    }

    async function seedRestamped(label: string): Promise<{
      supporterId: string;
      supporteeId: string;
      contract: VisibilityContract;
    }> {
      const seeded = await seedAccepted(label);
      const result = await restampGraduationContracts(db, {
        personId: seeded.supporteeId,
        occurredAt: NOW,
      });
      expect(result.restamped).toBe(1);
      return seeded;
    }

    async function seedLapsed(label: string): Promise<{
      supporterId: string;
      supporteeId: string;
    }> {
      const { supporterId, supporteeId } = await seedTwoPersons(label);
      const [edge] = await db
        .insert(supportership)
        .values({
          supporterPersonId: supporterId,
          supporteePersonId: supporteeId,
          grantedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning();
      supportershipIds.push(edge!.id);
      await db.insert(supportVisibilityContracts).values({
        supportershipId: edge!.id,
        supporterPersonId: supporterId,
        supporteePersonId: supporteeId,
        relation: 'other',
        status: 'lapsed',
        contractVersion: 1,
        reportableKinds: ['mastery'],
        artifactWall: true,
        renderEquivalence: true,
        safetyException: true,
        supporterAcceptedAt: NOW,
        supporteeAcceptedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { supporterId, supporteeId };
    }

    async function seedArchivedSupportee(label: string): Promise<{
      supporterId: string;
      supporteeId: string;
      contract: VisibilityContract;
    }> {
      const seeded = await seedAccepted(label);
      await db
        .update(person)
        .set({ archivedAt: NOW })
        .where(eq(person.id, seeded.supporteeId));
      return seeded;
    }

    async function expectDenied(
      supporterId: string,
      supporteeId: string,
    ): Promise<void> {
      const scopes = await resolveScopesForPerson(db, supporterId);
      expect(scopes.shape).toBe('learner');

      await expect(
        readSupporteeStructuralSubjects(db, supporterId, supporteeId),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }

    // Seeds one real `subjects` row for the supportee. Exists so the
    // positive-control ('accepted') test proves the correlated EXISTS
    // subquery added to readSupporteeStructuralSubjects's structural query
    // (supporter-structural-mask.ts, [WI-2237] TOCTOU re-check) actually
    // PERMITS real content through when the caller is authorized — not just
    // that it returns `[]` either way. Without a seeded subject, the
    // accepted-path assertion below is satisfied vacuously (an empty
    // `subjects: []` array is returned whether or not the EXISTS
    // correlation is wired correctly), so a silently-broken (always-false)
    // EXISTS clause would strip legitimate structural data in production
    // without any test catching it.
    async function seedSubjectForSupportee(
      supporteeId: string,
      name: string,
    ): Promise<string> {
      const [row] = await db
        .insert(subjects)
        .values({ profileId: supporteeId, name })
        .returning();
      subjectIds.push(row!.id);
      return row!.id;
    }

    async function expectAllowed(
      supporterId: string,
      supporteeId: string,
    ): Promise<void> {
      const scopes = await resolveScopesForPerson(db, supporterId);
      expect(scopes.shape).toBe('supporter');
      if (scopes.shape === 'supporter') {
        expect(
          scopes.scopes.some(
            (scope) =>
              scope.kind === 'person' && scope.personId === supporteeId,
          ),
        ).toBe(true);
      }

      const result = await readSupporteeStructuralSubjects(
        db,
        supporterId,
        supporteeId,
      );
      expect(result.personId).toBe(supporteeId);
    }

    // ---- variant: missing ----------------------------------------------

    it('denies person scope and structural reads when no supportership exists at all [missing]', async () => {
      const { supporterId, supporteeId } = await seedTwoPersons('missing');
      await expectDenied(supporterId, supporteeId);
    });

    // ---- variant: pending — the RGR guard --------------------------------

    it('RGR: denies person scope and masks structural reads when the visibility contract is pending, not accepted [WI-2237] [RGR]', async () => {
      const { supporterId, supporteeId } = await seedPending('pending');
      await expectDenied(supporterId, supporteeId);
    });

    // ---- variant: one-sided -----------------------------------------------

    it('denies person scope and structural reads when only the supporter side has accepted [one-sided]', async () => {
      const { supporterId, supporteeId } = await seedOneSided('one-sided');
      await expectDenied(supporterId, supporteeId);
    });

    // ---- variant: accepted (positive control) ------------------------------

    it('allows person scope and structural reads once both sides have accepted [accepted]', async () => {
      const { supporterId, supporteeId } = await seedAccepted('accepted');
      await expectAllowed(supporterId, supporteeId);

      // Prove the accepted path returns REAL content through the
      // EXISTS-gated structural query, not just an empty array that would
      // also satisfy expectAllowed's shape assertions if the correlated
      // EXISTS subquery ([WI-2237], supporter-structural-mask.ts) were
      // silently broken (e.g. always-false).
      const subjectId = await seedSubjectForSupportee(
        supporteeId,
        'Accepted-path structural content',
      );
      const result = await readSupporteeStructuralSubjects(
        db,
        supporterId,
        supporteeId,
      );
      expect(result.subjects).toHaveLength(1);
      expect(result.subjects[0]?.id).toBe(subjectId);
      expect(result.subjects[0]?.name).toBe('Accepted-path structural content');
    });

    // ---- variant: revoked ---------------------------------------------------

    it('denies person scope and structural reads once the supportee revokes an accepted link [revoked]', async () => {
      const { supporterId, supporteeId } = await seedRevoked('revoked');
      await expectDenied(supporterId, supporteeId);
    });

    // ---- variant: restamped / version-changed --------------------------------

    it('denies person scope and structural reads after a graduation restamp, before re-acceptance [restamped]', async () => {
      const { supporterId, supporteeId } = await seedRestamped('restamped');
      await expectDenied(supporterId, supporteeId);
    });

    // ---- variant: lapsed --------------------------------------------------

    it('denies person scope and structural reads for a lapsed contract on a non-revoked edge [lapsed]', async () => {
      const { supporterId, supporteeId } = await seedLapsed('lapsed');
      await expectDenied(supporterId, supporteeId);
    });

    // ---- variant: archived-person ------------------------------------------

    it('denies person scope and structural reads once the accepted supportee is archived [archived-person]', async () => {
      const { supporterId, supporteeId } =
        await seedArchivedSupportee('archived-person');
      await expectDenied(supporterId, supporteeId);
    });

    // ---- variant: stale-cache/client + accept/revoke race -------------------

    it('re-checks authorization on every call: a client holding a stale accepted personId is denied the instant the link is revoked [stale-cache / accept-revoke race]', async () => {
      const { supporterId, supporteeId, contract } = await seedAccepted('race');

      // Client fetches once while accepted — succeeds, and the client would
      // now cache this personId as an authorized scope.
      await expectAllowed(supporterId, supporteeId);

      // The supportee revokes mid-session (simulates the race window: a
      // revoke landing after the client's first successful read, before its
      // next one).
      await requestSelfUnlink(db, {
        supportershipId: contract.supportershipId,
        callerPersonId: supporteeId,
        now: NOW,
      });

      // The SAME stale personId, re-requested, must now be denied — proving
      // neither function caches or trusts a previously-valid authorization
      // decision across calls.
      await expectDenied(supporterId, supporteeId);
    });
  },
);
