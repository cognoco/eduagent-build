import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { CONSENT_PURPOSES } from '@eduagent/schemas';
import {
  assessments,
  consentGrant,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  guardianship,
  learningSessions,
  membership,
  needsDeepeningTopics,
  organization,
  person,
  retentionCards,
  subjects,
  topicNotes,
  type Database,
} from '@eduagent/database';
import { ForbiddenError } from '../errors';
import { getLatestVerifiedProofForChild } from './parent-proof';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
let db: Database;
let seedCounter = 0;
const personIds: string[] = [];
const orgIds: string[] = [];

async function seedProfile(input: {
  displayName: string;
  isOwner?: boolean;
  orgId?: string;
}): Promise<{ orgId: string; profileId: string }> {
  ++seedCounter;

  let orgId: string;
  if (input.orgId) {
    orgId = input.orgId;
  } else {
    const [org] = await db
      .insert(organization)
      .values({ name: `Parent Proof Test Org ${RUN_ID}_${seedCounter}` })
      .returning({ id: organization.id });
    orgIds.push(org!.id);
    orgId = org!.id;
  }

  const [p] = await db
    .insert(person)
    .values({
      displayName: input.displayName,
      birthDate: '2010-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning({ id: person.id });
  personIds.push(p!.id);

  await db.insert(membership).values({
    personId: p!.id,
    organizationId: orgId,
    roles: (input.isOwner ?? true) ? ['admin'] : ['learner'],
  });

  return { orgId, profileId: p!.id };
}

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  await db.insert(guardianship).values({
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });
}

async function seedConsented(profileId: string, orgId: string): Promise<void> {
  const grantedAt = new Date();
  await db.insert(consentGrant).values(
    CONSENT_PURPOSES.map((purpose) => ({
      chargePersonId: profileId,
      organizationId: orgId,
      purpose,
      lawfulBasis: 'gdpr_parental_consent' as const,
      granted: true,
      grantedAt,
    })),
  );
}

async function seedTopic(
  profileId: string,
  subjectName: string,
  topicTitle: string,
): Promise<{ subjectId: string; topicId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: subjectName,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: 'Seeded Book',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: topicTitle,
      description: `${topicTitle} description`,
      sortOrder: 0,
      estimatedMinutes: 20,
    })
    .returning({ id: curriculumTopics.id });

  return { subjectId: subject!.id, topicId: topic!.id };
}

async function seedSession(
  profileId: string,
  subjectId: string,
  topicId: string,
): Promise<string> {
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 4,
      escalationRung: 1,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      endedAt: new Date(),
    })
    .returning({ id: learningSessions.id });

  return session!.id;
}

async function seedVerifiedAssessment(input: {
  profileId: string;
  subjectId: string;
  topicId: string;
  sessionId: string;
  verifiedAt: Date;
}): Promise<void> {
  await db.insert(assessments).values({
    profileId: input.profileId,
    subjectId: input.subjectId,
    topicId: input.topicId,
    sessionId: input.sessionId,
    status: 'passed',
    verificationDepth: 'recall',
    masteryScore: 0.9,
    masteryChallengeVerifiedAt: input.verifiedAt,
    exchangeHistory: [],
  });
}

afterAll(async () => {
  for (const pid of personIds) {
    await db.delete(guardianship).where(eq(guardianship.guardianPersonId, pid));
    await db.delete(guardianship).where(eq(guardianship.chargePersonId, pid));
    await db.delete(consentGrant).where(eq(consentGrant.chargePersonId, pid));
    await db.delete(membership).where(eq(membership.personId, pid));
    await db.delete(person).where(eq(person.id, pid));
  }
  for (const oid of orgIds) {
    await db.delete(organization).where(eq(organization.id, oid));
  }
});

describeIfDb('getLatestVerifiedProofForChild (integration) [WI-1658]', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  it('returns hasProof:false when the child has no verified assessment', async () => {
    const parent = await seedProfile({ displayName: 'Parent Empty' });
    const child = await seedProfile({
      displayName: 'Child Empty',
      isOwner: false,
      orgId: parent.orgId,
    });
    await seedFamilyLink(parent.profileId, child.profileId);
    await seedConsented(child.profileId, parent.orgId);

    const result = await getLatestVerifiedProofForChild(
      db,
      parent.profileId,
      child.profileId,
    );

    expect(result).toEqual({ hasProof: false, quote: null });
  });

  it('returns the latest verified topic/date/verification-state/retention-status when one exists', async () => {
    const parent = await seedProfile({ displayName: 'Parent Proof' });
    const child = await seedProfile({
      displayName: 'Child Proof',
      isOwner: false,
      orgId: parent.orgId,
    });
    await seedFamilyLink(parent.profileId, child.profileId);
    await seedConsented(child.profileId, parent.orgId);
    const { subjectId, topicId } = await seedTopic(
      child.profileId,
      'Biology',
      'Photosynthesis',
    );
    const sessionId = await seedSession(child.profileId, subjectId, topicId);
    const verifiedAt = new Date();
    await seedVerifiedAssessment({
      profileId: child.profileId,
      subjectId,
      topicId,
      sessionId,
      verifiedAt,
    });
    await db.insert(retentionCards).values({
      profileId: child.profileId,
      topicId,
      xpStatus: 'verified',
      intervalDays: 7,
      lastReviewedAt: verifiedAt,
      nextReviewAt: new Date(verifiedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      repetitions: 1,
      consecutiveSuccesses: 1,
      failureCount: 0,
    });
    await db.insert(topicNotes).values({
      profileId: child.profileId,
      topicId,
      sessionId,
      content: 'Plants convert light into chemical energy.',
      artifactSource: 'challenge_drafted_note',
      verificationState: 'verified',
    });

    const result = await getLatestVerifiedProofForChild(
      db,
      parent.profileId,
      child.profileId,
    );

    expect(result.hasProof).toBe(true);
    expect(result.topicId).toBe(topicId);
    expect(result.topicTitle).toBe('Photosynthesis');
    expect(result.subjectId).toBe(subjectId);
    expect(result.sessionId).toBe(sessionId);
    expect(result.masteryVerificationState).toBe('fresh');
    expect(result.retentionStatus).toBe('strong');
    expect(result.quote).toBe('Plants convert light into chemical energy.');
  });

  it('returns quote:null (degradation) when no artifactSource note exists for that topic+session', async () => {
    const parent = await seedProfile({ displayName: 'Parent Degrade' });
    const child = await seedProfile({
      displayName: 'Child Degrade',
      isOwner: false,
      orgId: parent.orgId,
    });
    await seedFamilyLink(parent.profileId, child.profileId);
    await seedConsented(child.profileId, parent.orgId);
    const { subjectId, topicId } = await seedTopic(
      child.profileId,
      'Chemistry',
      'Atomic Structure',
    );
    const sessionId = await seedSession(child.profileId, subjectId, topicId);
    await seedVerifiedAssessment({
      profileId: child.profileId,
      subjectId,
      topicId,
      sessionId,
      verifiedAt: new Date(),
    });
    // No topic_notes row seeded at all — the finalize round only produced a
    // fallback prompt (no draft body).

    const result = await getLatestVerifiedProofForChild(
      db,
      parent.profileId,
      child.profileId,
    );

    expect(result.hasProof).toBe(true);
    expect(result.quote).toBeNull();
  });

  it('[WI-1658 rework] ages out a marked note past the retention window — quote returns null, card still renders (AC4)', async () => {
    const parent = await seedProfile({ displayName: 'Parent AgeOut' });
    const child = await seedProfile({
      displayName: 'Child AgeOut',
      isOwner: false,
      orgId: parent.orgId,
    });
    await seedFamilyLink(parent.profileId, child.profileId);
    await seedConsented(child.profileId, parent.orgId);
    const { subjectId, topicId } = await seedTopic(
      child.profileId,
      'Geography',
      'Plate Tectonics',
    );
    const sessionId = await seedSession(child.profileId, subjectId, topicId);
    await seedVerifiedAssessment({
      profileId: child.profileId,
      subjectId,
      topicId,
      sessionId,
      verifiedAt: new Date(),
    });
    // Marked note seeded 31 days old — one day past the 30-day age-out
    // window this WI shares with transcript-purge-cron.ts's own cutoff.
    const agedCreatedAt = new Date();
    agedCreatedAt.setUTCDate(agedCreatedAt.getUTCDate() - 31);
    await db.insert(topicNotes).values({
      profileId: child.profileId,
      topicId,
      sessionId,
      content: 'This quote should never come back once aged out.',
      artifactSource: 'challenge_drafted_note',
      verificationState: 'verified',
      createdAt: agedCreatedAt,
    });

    const result = await getLatestVerifiedProofForChild(
      db,
      parent.profileId,
      child.profileId,
    );

    // Topic/date/verification-status still return (the card keeps working) —
    // only the quote is suppressed, same degradation branch as "no note".
    expect(result.hasProof).toBe(true);
    expect(result.topicId).toBe(topicId);
    expect(result.quote).toBeNull();
  });

  it('never returns a learner-authored note (no artifactSource marker) as the quote', async () => {
    const parent = await seedProfile({ displayName: 'Parent Collision' });
    const child = await seedProfile({
      displayName: 'Child Collision',
      isOwner: false,
      orgId: parent.orgId,
    });
    await seedFamilyLink(parent.profileId, child.profileId);
    await seedConsented(child.profileId, parent.orgId);
    const { subjectId, topicId } = await seedTopic(
      child.profileId,
      'History',
      'The Silk Road',
    );
    const sessionId = await seedSession(child.profileId, subjectId, topicId);
    await seedVerifiedAssessment({
      profileId: child.profileId,
      subjectId,
      topicId,
      sessionId,
      verifiedAt: new Date(),
    });
    // Seed BOTH an ordinary session-summary note (no marker) and a
    // Challenge-verified note (marked) for the SAME (topicId, sessionId) —
    // the concrete regression this WI's schema fork exists to prevent. The
    // UNMARKED note gets a strictly NEWER createdAt than the marked one, so
    // this is a deterministic guard: without the artifactSource filter,
    // `ORDER BY desc(createdAt) LIMIT 1` would reliably return the wrong
    // (unmarked, newer) row instead of passing by an unspecified
    // same-timestamp tie-break.
    const now = new Date();
    await db.insert(topicNotes).values({
      profileId: child.profileId,
      topicId,
      sessionId,
      content: 'The verified concept quote.',
      artifactSource: 'challenge_drafted_note',
      verificationState: 'verified',
      createdAt: new Date(now.getTime() - 1000),
    });
    await db.insert(topicNotes).values({
      profileId: child.profileId,
      topicId,
      sessionId,
      content: 'An ordinary session-summary reflection.',
      createdAt: now,
    });

    const result = await getLatestVerifiedProofForChild(
      db,
      parent.profileId,
      child.profileId,
    );

    expect(result.quote).toBe('The verified concept quote.');
  });

  it('throws ForbiddenError for a non-owner/proxy caller', async () => {
    const parent = await seedProfile({ displayName: 'Parent Denied' });
    const stranger = await seedProfile({ displayName: 'Stranger' });
    const child = await seedProfile({
      displayName: 'Child Denied',
      isOwner: false,
      orgId: parent.orgId,
    });
    await seedFamilyLink(parent.profileId, child.profileId);
    await seedConsented(child.profileId, parent.orgId);

    await expect(
      getLatestVerifiedProofForChild(db, stranger.profileId, child.profileId),
    ).rejects.toThrow(ForbiddenError);
  });

  it('stale verification (post-verification weak-spot row) is reflected in masteryVerificationState', async () => {
    const parent = await seedProfile({ displayName: 'Parent Stale' });
    const child = await seedProfile({
      displayName: 'Child Stale',
      isOwner: false,
      orgId: parent.orgId,
    });
    await seedFamilyLink(parent.profileId, child.profileId);
    await seedConsented(child.profileId, parent.orgId);
    const { subjectId, topicId } = await seedTopic(
      child.profileId,
      'Physics',
      'Newton’s Laws',
    );
    const sessionId = await seedSession(child.profileId, subjectId, topicId);
    const verifiedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await seedVerifiedAssessment({
      profileId: child.profileId,
      subjectId,
      topicId,
      sessionId,
      verifiedAt,
    });
    // A weak-spot row created AFTER verification, with an actionable status —
    // this is the counter-evidence that flips masteryVerificationState.
    await db.insert(needsDeepeningTopics).values({
      profileId: child.profileId,
      subjectId,
      topicId,
      status: 'active',
      source: 'system_signal',
    });

    const result = await getLatestVerifiedProofForChild(
      db,
      parent.profileId,
      child.profileId,
    );

    expect(result.masteryVerificationState).toBe('stale');
  });
});
