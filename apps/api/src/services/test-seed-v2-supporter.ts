// ---------------------------------------------------------------------------
// [WI-2241] Supportership-aware v2 seed: `v2-supporter-accepted`.
//
// CLASSIFICATION/REUSE (per the WI): V2 supportee scope reads active
// supportership, but test-seed-v2.ts only builds the identity spine
// (organization/person/login/membership) and test-seed.ts's rich parent
// scenarios build guardianship/learning data, not supportership. This file
// composes both — plus the accepted-supportership/visibility-contract write
// path already proven in supporter-visibility-authorization.integration.test.ts
// (initiateLink + acceptLink, both audiences) — rather than fabricating an
// 'accepted' contract row via raw insert. Raw insert is used only where no
// producer exists (matching that integration suite's own convention).
//
// Seeds ONE supporter identity (the one that signs in — SeedResult's top-level
// accountId/profileId/email/password) plus THREE independent v2 owner
// supportee identities (their own org/login/Clerk user each, since a
// supporter/supportee link is not the guardianship same-org model):
//
//   - "rich"    — subjects/topics/progress, an accepted session recap, a
//                 weekly report, and a milestone (all shareable facts the
//                 shared-record read model — shared-record-read-model.ts —
//                 surfaces), alongside PRIVATE artifacts (a topic note, a
//                 raw session-event/transcript row, a bookmark, and a
//                 Mentor-memory row) that must never surface on any
//                 supporter-facing surface.
//   - "empty"   — an accepted edge with zero shareable facts, for the honest
//                 empty-state assertion.
//   - "revoked" — accepted, then the supportee revokes via the real
//                 requestSelfUnlink write path (same producer as WI-2237's
//                 [revoked] RGR variant), for the fail-closed assertion.
// ---------------------------------------------------------------------------
import { eq } from 'drizzle-orm';
import {
  bookmarks,
  generateUUIDv7,
  learningProfiles,
  login,
  membership,
  milestones,
  sessionEvents,
  topicNotes,
  type Database,
} from '@eduagent/database';
import type { RenderAudience } from '@eduagent/schemas';

import { acceptLink, initiateLink } from './linking-ceremony';
import { requestSelfUnlink } from './supportership-revocation';
import { seedOwnerIdentityV2 } from './test-seed-v2';
import {
  createClerkTestUser,
  createSubjectWithCurriculum,
  deleteOrganizationGraph,
  insertRetentionCards,
  insertSessionWithRecap,
  insertWeeklyReport,
  type SeedEnv,
  type SeedResult,
} from './test-seed';

/**
 * Derives a stable, unique email for a satellite identity from the request
 * email. The request `email` param is the ONLY value seedScenario's generic
 * idempotent cleanup (test-seed.ts) matches on — a supportee living under a
 * different email would never be cleaned up on reseed. Stripping any existing
 * `+tag` (e.g. Maestro's `native-0N+clerk_test@...` slot emails) before
 * appending our own keeps every derived address unique per request email
 * while staying deterministic across repeated reseeds of the same slot.
 */
function deriveEmail(baseEmail: string, tag: string): string {
  const atIndex = baseEmail.indexOf('@');
  const local = atIndex === -1 ? baseEmail : baseEmail.slice(0, atIndex);
  const domain = atIndex === -1 ? 'example.com' : baseEmail.slice(atIndex + 1);
  const bareLocal = local.split('+')[0] || 'seed';
  return `${bareLocal}+${tag}@${domain}`;
}

interface SeededOwnerV2 {
  organizationId: string;
  personId: string;
  loginId: string;
  password: string;
}

/**
 * Seeds one v2 owner identity (test-seed-v2.ts's seedOwnerIdentityV2), doing
 * its own idempotent pre-clean first — this identity's email is DERIVED, so
 * it is invisible to seedScenario's generic by-request-email cleanup.
 * Mirrors that same lookup-by-login-email → collect memberships →
 * deleteOrganizationGraph pattern.
 */
async function reseedOwnerIdentityV2(
  db: Database,
  email: string,
  env: SeedEnv,
  opts: { displayName: string; birthYear: number },
): Promise<SeededOwnerV2> {
  const existingLogins = await db
    .select({ personId: login.personId })
    .from(login)
    .where(eq(login.email, email));
  const existingPersonId = existingLogins[0]?.personId;
  if (existingPersonId) {
    const existingMemberships = await db
      .select({ organizationId: membership.organizationId })
      .from(membership)
      .where(eq(membership.personId, existingPersonId));
    await deleteOrganizationGraph(db, [
      ...new Set(existingMemberships.map((m) => m.organizationId)),
    ]);
  }

  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const identity = await seedOwnerIdentityV2(db, {
    email,
    clerkUserId,
    displayName: opts.displayName,
    birthYear: opts.birthYear,
  });
  return { ...identity, password };
}

interface AcceptedEdge {
  edgeId: string;
  contractId: string;
  status: string;
}

/**
 * Initiates and fully accepts (both audiences) a supportership link via the
 * real linking-ceremony write path — the "truthful fixture" the AC requires,
 * not a fabricated 'accepted' row.
 */
async function seedAcceptedEdge(
  db: Database,
  input: { supporterPersonId: string; supporteePersonId: string },
): Promise<AcceptedEdge> {
  const initiated = await initiateLink(db, {
    supporterPersonId: input.supporterPersonId,
    supporteePersonId: input.supporteePersonId,
    relation: 'other',
    managedTier: false,
    managedTierActive: false,
  });
  await acceptLink(db, initiated.id, {
    actorPersonId: input.supporterPersonId,
    audience: 'supporter' as RenderAudience,
  });
  const accepted = await acceptLink(db, initiated.id, {
    actorPersonId: input.supporteePersonId,
    audience: 'supportee' as RenderAudience,
  });
  return {
    edgeId: accepted.supportershipId,
    contractId: accepted.id,
    status: accepted.status,
  };
}

export async function seedV2SupporterAccepted(
  db: Database,
  email: string,
  env: SeedEnv,
): Promise<SeedResult> {
  const supporter = await reseedOwnerIdentityV2(db, email, env, {
    displayName: 'Test Supporter',
    birthYear: 1985,
  });

  const richSupporteeEmail = deriveEmail(email, 'supportee');
  const emptySupporteeEmail = deriveEmail(email, 'supportee-empty');
  const revokedSupporteeEmail = deriveEmail(email, 'supportee-revoked');

  const richSupportee = await reseedOwnerIdentityV2(
    db,
    richSupporteeEmail,
    env,
    {
      displayName: 'Test Supportee',
      birthYear: 2011,
    },
  );
  const emptySupportee = await reseedOwnerIdentityV2(
    db,
    emptySupporteeEmail,
    env,
    { displayName: 'Empty-Record Supportee', birthYear: 2012 },
  );
  const revokedSupportee = await reseedOwnerIdentityV2(
    db,
    revokedSupporteeEmail,
    env,
    { displayName: 'Revoked Supportee', birthYear: 2013 },
  );

  // --- Rich edge -----------------------------------------------------------
  const richEdge = await seedAcceptedEdge(db, {
    supporterPersonId: supporter.personId,
    supporteePersonId: richSupportee.personId,
  });

  const { subjectId, bookId, topicIds } = await createSubjectWithCurriculum(
    db,
    richSupportee.personId,
    'Fractions',
    'active',
    2,
  );
  const topicId = topicIds[0];
  if (!topicId)
    throw new Error('createSubjectWithCurriculum returned no topics');

  const { retentionCardIds } = await insertRetentionCards(db, {
    profileId: richSupportee.personId,
    topicId,
    count: 1,
  });
  const retentionCardId = retentionCardIds[0];
  if (!retentionCardId)
    throw new Error('insertRetentionCards returned no retention cards');

  const { sessionId, summaryId } = await insertSessionWithRecap(db, {
    profileId: richSupportee.personId,
    subjectId,
    topicId,
  });

  const { reportId: weeklyReportId } = await insertWeeklyReport(db, {
    profileId: supporter.personId,
    childProfileId: richSupportee.personId,
    childName: 'Test Supportee',
  });

  const milestoneId = generateUUIDv7();
  await db.insert(milestones).values({
    id: milestoneId,
    profileId: richSupportee.personId,
    milestoneType: 'session_count',
    threshold: 5,
    subjectId,
    bookId,
    metadata: {
      title: 'Five focused sessions',
      summary: 'Shareable milestone fact used by the shared-record read model.',
    },
    celebratedAt: new Date(),
  });

  // Private artifacts — must be ABSENT from every supporter-facing surface
  // (the NEGATIVE WALL: chat/transcript, learner private notes/bookmarks,
  // learner Mentor memory).
  const topicNoteId = generateUUIDv7();
  await db.insert(topicNotes).values({
    id: topicNoteId,
    profileId: richSupportee.personId,
    topicId,
    sessionId,
    content:
      'PRIVATE learner note — must never reach the supporter (WI-2241 negative-wall fixture).',
  });

  const bookmarkId = generateUUIDv7();
  await db.insert(bookmarks).values({
    id: bookmarkId,
    profileId: richSupportee.personId,
    sessionId,
    eventId: generateUUIDv7(),
    subjectId,
    topicId,
    content:
      'PRIVATE learner bookmark — must never reach the supporter (WI-2241 negative-wall fixture).',
  });

  const transcriptEventId = generateUUIDv7();
  await db.insert(sessionEvents).values({
    id: transcriptEventId,
    sessionId,
    profileId: richSupportee.personId,
    subjectId,
    topicId,
    eventType: 'user_message',
    content:
      'PRIVATE raw chat transcript — must never reach the supporter (WI-2241 negative-wall fixture).',
  });

  await db.insert(learningProfiles).values({
    profileId: richSupportee.personId,
    learningStyle: {
      preferredExplanations: ['diagrams'],
      pacePreference: 'thorough',
      responseToChallenge: 'motivated',
      confidence: 'medium',
      corroboratingSessions: 1,
      source: 'inferred',
    },
    interests: ['PRIVATE mentor-memory interest — must never reach supporter'],
    strengths: [],
    struggles: [],
    communicationNotes: ['PRIVATE — must never reach the supporter'],
    suppressedInferences: [],
    interestTimestamps: {},
    memoryEnabled: true,
    memoryConsentStatus: 'granted',
    memoryCollectionEnabled: true,
    memoryInjectionEnabled: true,
  });

  // --- Empty edge: accepted, zero shareable facts ---------------------------
  const emptyEdge = await seedAcceptedEdge(db, {
    supporterPersonId: supporter.personId,
    supporteePersonId: emptySupportee.personId,
  });

  // --- Revoked edge: accepted, then revoked (fail-closed fixture) ----------
  const revokedEdge = await seedAcceptedEdge(db, {
    supporterPersonId: supporter.personId,
    supporteePersonId: revokedSupportee.personId,
  });
  await requestSelfUnlink(db, {
    supportershipId: revokedEdge.edgeId,
    callerPersonId: revokedSupportee.personId,
  });

  return {
    scenario: 'v2-supporter-accepted',
    accountId: supporter.organizationId,
    profileId: supporter.personId,
    email,
    password: supporter.password,
    ids: {
      supporterPersonId: supporter.personId,
      supporterOrganizationId: supporter.organizationId,

      supporteeEmail: richSupporteeEmail,
      supporteePassword: richSupportee.password,
      supporteePersonId: richSupportee.personId,
      supporteeOrganizationId: richSupportee.organizationId,
      edgeId: richEdge.edgeId,
      contractId: richEdge.contractId,
      visibilityStatus: richEdge.status,
      subjectId,
      bookId,
      topicId,
      sessionId,
      sessionSummaryId: summaryId,
      weeklyReportId,
      milestoneId,
      retentionCardId,
      topicNoteId,
      bookmarkId,
      transcriptEventId,

      emptySupporteeEmail,
      emptySupporteePassword: emptySupportee.password,
      emptySupporteePersonId: emptySupportee.personId,
      emptySupporteeOrganizationId: emptySupportee.organizationId,
      emptyEdgeId: emptyEdge.edgeId,
      emptyContractId: emptyEdge.contractId,

      revokedSupporteeEmail,
      revokedSupporteePassword: revokedSupportee.password,
      revokedSupporteePersonId: revokedSupportee.personId,
      revokedSupporteeOrganizationId: revokedSupportee.organizationId,
      revokedEdgeId: revokedEdge.edgeId,
      revokedContractId: revokedEdge.contractId,
    },
  };
}
