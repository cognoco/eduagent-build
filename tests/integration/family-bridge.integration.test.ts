import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  accounts,
  curricula,
  curriculumBooks,
  curriculumTopics,
  familyLinks,
  generateUUIDv7,
  guardianship,
  learningSessions,
  login,
  membership,
  needsDeepeningTopics,
  organization,
  person,
  profiles,
  subjects,
} from '@eduagent/database';

import {
  cleanupAccounts,
  createIntegrationDb,
  isIdentityV2Enabled,
} from './helpers';
import {
  cloneTopicFromChild,
  undoCloneFromChild,
} from '../../apps/api/src/services/family-bridge';
import { startRelearn } from '../../apps/api/src/services/retention-data';

type IntegrationDb = ReturnType<typeof createIntegrationDb>;

const EMAIL = 'family-bridge@integration.test';
const CLERK_USER_ID = 'integration-family-bridge-user';

// [WI-586] These tests call the family-bridge service directly (not via HTTP),
// so they must thread the identity-v2 flag the route layer would otherwise set.
// Flag-ON the parent-access guard reads `guardianship`; flag-OFF `family_links`.
const SERVICE_OPTS = { identityV2Enabled: isIdentityV2Enabled() };
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function seedFamily() {
  const db = createIntegrationDb();

  // [WI-1145] Seed the v2 graph + legacy stubs UNCONDITIONALLY with reseed-aligned
  // ids (organization.id == accountId, person.id == profileId). cloneTopicFromChild's
  // active-edge guard reads `guardianship` regardless of the carved SERVICE_OPTS
  // flag, while getChildTopicSnapshotForParent honors SERVICE_OPTS and reads
  // `family_links` on the flag-off path — so seed BOTH the guardianship edge AND
  // family_links to cover both guards across the flag/collapse transition.
  const accountId = generateUUIDv7();
  const adultId = generateUUIDv7();
  const childId = generateUUIDv7();
  await db
    .insert(organization)
    .values({ id: accountId, name: `Family org ${accountId.slice(0, 8)}` });
  await db.insert(person).values([
    {
      id: adultId,
      displayName: 'Parent',
      birthDate: '1985-01-01',
      residenceJurisdiction: 'US',
    },
    {
      id: childId,
      displayName: 'Ada',
      birthDate: '2013-01-01',
      residenceJurisdiction: 'US',
    },
  ]);
  await db.insert(login).values({
    personId: adultId,
    clerkUserId: CLERK_USER_ID,
    email: EMAIL,
  });
  await db.insert(membership).values([
    { personId: adultId, organizationId: accountId, roles: ['admin'] },
    { personId: childId, organizationId: accountId, roles: ['learner'] },
  ]);
  await db.insert(guardianship).values({
    guardianPersonId: adultId,
    chargePersonId: childId,
  });
  // [WI-808] Dual-write: subjects.profile_id and profiles.account_id still FK to
  // profiles and accounts respectively. Insert stub accounts + profiles rows so
  // seedLearningTree's subjects insert and the profiles FK chain are satisfied,
  // and family_links so the flag-off SERVICE_OPTS parent-access guard resolves.
  await db.insert(accounts).values({
    id: accountId,
    clerkUserId: CLERK_USER_ID,
    email: EMAIL,
  });
  await db.insert(profiles).values([
    {
      id: adultId,
      accountId,
      displayName: 'Parent',
      birthYear: 1985,
      isOwner: true,
      conversationLanguage: 'en',
    },
    {
      id: childId,
      accountId,
      displayName: 'Ada',
      birthYear: 2013,
      isOwner: false,
      conversationLanguage: 'en',
    },
  ]);
  await db.insert(familyLinks).values({
    parentProfileId: adultId,
    childProfileId: childId,
  });

  const account = { id: accountId, clerkUserId: CLERK_USER_ID, email: EMAIL };
  const adult = { id: adultId, accountId, displayName: 'Parent' };
  const child = { id: childId, accountId, displayName: 'Ada' };

  const childLearning = await seedLearningTree(db, {
    profileId: child.id,
    subjectName: 'Mathematics',
    bookTitle: 'Numbers That Matter',
    topicTitle: 'Fractions',
    topicDescription: 'Child version of fractions.',
  });

  return { db, account, adult, child, childLearning };
}

async function seedLearningTree(
  db: IntegrationDb,
  input: {
    profileId: string;
    subjectName: string;
    bookTitle: string;
    topicTitle: string;
    topicDescription: string;
  },
) {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: input.profileId,
      name: input.subjectName,
      rawInput: input.subjectName,
      status: 'active',
      pedagogyMode: 'socratic',
      languageCode: 'en',
    })
    .returning();
  if (!subject) throw new Error('Subject seed failed');

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject.id, version: 1 })
    .returning();
  if (!curriculum) throw new Error('Curriculum seed failed');

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject.id,
      title: input.bookTitle,
      description: null,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning();
  if (!book) throw new Error('Book seed failed');

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      bookId: book.id,
      title: input.topicTitle,
      description: input.topicDescription,
      sortOrder: 0,
      estimatedMinutes: 20,
      relevance: 'core',
      source: 'generated',
    })
    .returning();
  if (!topic) throw new Error('Topic seed failed');

  return { subject, curriculum, book, topic };
}

async function findAdultTopic(
  db: IntegrationDb,
  adultProfileId: string,
  title: string,
) {
  const [row] = await db
    .select({
      topic: curriculumTopics,
      subject: subjects,
      book: curriculumBooks,
    })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
    .where(
      and(
        eq(subjects.profileId, adultProfileId),
        eq(curriculumTopics.title, title),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function countAdultTopics(
  db: IntegrationDb,
  adultProfileId: string,
  title: string,
) {
  const rows = await db
    .select({ id: curriculumTopics.id })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
    .where(
      and(
        eq(subjects.profileId, adultProfileId),
        eq(curriculumTopics.title, title),
      ),
    );
  return rows.length;
}

beforeEach(async () => {
  await cleanupAccounts({ emails: [EMAIL] });
});

afterAll(async () => {
  await cleanupAccounts({ emails: [EMAIL] });
});

describe('family bridge integration', () => {
  it('creates a parent bridge topic with child provenance', async () => {
    const fixture = await seedFamily();

    const result = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId: randomUUID(),
      },
      SERVICE_OPTS,
    );

    expect(result).toMatchObject({
      subjectId: expect.any(String),
      alreadyExisted: false,
      descriptionDivergent: false,
      descriptionRefreshed: false,
      topicState: 'unstarted',
    });
    expect(result.createdIds.topicId).toEqual(
      expect.stringMatching(UUID_REGEX),
    );
    expect(result.createdIds.subjectId).toEqual(
      expect.stringMatching(UUID_REGEX),
    );
    expect(result.createdIds.bookId).toEqual(expect.stringMatching(UUID_REGEX));

    const adultTopic = await findAdultTopic(
      fixture.db,
      fixture.adult.id,
      'Fractions',
    );
    expect(adultTopic?.topic.source).toBe('parent_bridge');
    expect(adultTopic?.topic.sourceChildProfileId).toBe(fixture.child.id);
    expect(adultTopic?.topic.description).toBe('Child version of fractions.');
  });

  it('refreshes divergent unstarted adult topics instead of duplicating them', async () => {
    const fixture = await seedFamily();
    const adultLearning = await seedLearningTree(fixture.db, {
      profileId: fixture.adult.id,
      subjectName: 'Mathematics',
      bookTitle: 'Numbers That Matter',
      topicTitle: 'Fractions',
      topicDescription: 'Old adult version.',
    });

    const result = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId: randomUUID(),
      },
      SERVICE_OPTS,
    );

    expect(result).toMatchObject({
      topicId: adultLearning.topic.id,
      alreadyExisted: true,
      descriptionDivergent: false,
      descriptionRefreshed: true,
      topicState: 'unstarted',
    });

    const adultTopic = await findAdultTopic(
      fixture.db,
      fixture.adult.id,
      'Fractions',
    );
    expect(adultTopic?.topic.description).toBe('Child version of fractions.');
    expect(adultTopic?.topic.sourceChildProfileId).toBe(fixture.child.id);
    expect(
      await countAdultTopics(fixture.db, fixture.adult.id, 'Fractions'),
    ).toBe(1);
  });

  it('keeps divergent in-progress adult topics unchanged', async () => {
    const fixture = await seedFamily();
    const adultLearning = await seedLearningTree(fixture.db, {
      profileId: fixture.adult.id,
      subjectName: 'Mathematics',
      bookTitle: 'Numbers That Matter',
      topicTitle: 'Fractions',
      topicDescription: 'Adult work in progress.',
    });
    await fixture.db.insert(needsDeepeningTopics).values({
      profileId: fixture.adult.id,
      subjectId: adultLearning.subject.id,
      topicId: adultLearning.topic.id,
      status: 'active',
      source: 'integration-test',
    });

    const result = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId: randomUUID(),
      },
      SERVICE_OPTS,
    );

    expect(result).toMatchObject({
      topicId: adultLearning.topic.id,
      alreadyExisted: true,
      descriptionDivergent: true,
      descriptionRefreshed: false,
      topicState: 'in_progress',
    });

    const adultTopic = await findAdultTopic(
      fixture.db,
      fixture.adult.id,
      'Fractions',
    );
    expect(adultTopic?.topic.description).toBe('Adult work in progress.');
  });

  it('reports completed when the matching adult topic has a completed session', async () => {
    const fixture = await seedFamily();
    const adultLearning = await seedLearningTree(fixture.db, {
      profileId: fixture.adult.id,
      subjectName: 'Mathematics',
      bookTitle: 'Numbers That Matter',
      topicTitle: 'Fractions',
      topicDescription: 'Child version of fractions.',
    });
    await fixture.db.insert(learningSessions).values({
      profileId: fixture.adult.id,
      subjectId: adultLearning.subject.id,
      topicId: adultLearning.topic.id,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 5,
      escalationRung: 1,
    });

    const result = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId: randomUUID(),
      },
      SERVICE_OPTS,
    );

    expect(result).toMatchObject({
      topicId: adultLearning.topic.id,
      alreadyExisted: true,
      descriptionDivergent: false,
      descriptionRefreshed: false,
      topicState: 'completed',
    });
  });

  it('force-copies a separate provenance-tagged topic when requested', async () => {
    const fixture = await seedFamily();
    await seedLearningTree(fixture.db, {
      profileId: fixture.adult.id,
      subjectName: 'Mathematics',
      bookTitle: 'Numbers That Matter',
      topicTitle: 'Fractions',
      topicDescription: 'Adult existing version.',
    });

    const result = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId: randomUUID(),
        forceCopy: true,
      },
      SERVICE_OPTS,
    );

    expect(result).toMatchObject({
      alreadyExisted: false,
      descriptionDivergent: false,
      topicState: 'unstarted',
    });

    const adultTopic = await findAdultTopic(
      fixture.db,
      fixture.adult.id,
      'Fractions (copy)',
    );
    expect(adultTopic?.topic.id).toBe(result.topicId);
    expect(adultTopic?.topic.sourceChildProfileId).toBe(fixture.child.id);
  });

  it('replays duplicate request IDs without creating duplicate topics', async () => {
    const fixture = await seedFamily();
    const requestId = randomUUID();

    const first = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId,
      },
      SERVICE_OPTS,
    );
    const second = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId,
      },
      SERVICE_OPTS,
    );

    expect(second).toEqual(first);
    expect(
      await countAdultTopics(fixture.db, fixture.adult.id, 'Fractions'),
    ).toBe(1);
  });

  it('undo deletes a newly cloned bridge topic before learning starts', async () => {
    const fixture = await seedFamily();
    const clone = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId: randomUUID(),
      },
      SERVICE_OPTS,
    );

    const undo = await undoCloneFromChild(
      fixture.db,
      fixture.adult.id,
      clone.createdIds,
      SERVICE_OPTS,
    );

    expect(undo).toEqual({ deleted: { topic: true } });
    const topic = await fixture.db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, clone.topicId),
    });
    expect(topic).toBeUndefined();
  });

  it('undo refuses to delete a bridge topic once a session references it', async () => {
    const fixture = await seedFamily();
    const clone = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId: randomUUID(),
      },
      SERVICE_OPTS,
    );
    await fixture.db.insert(learningSessions).values({
      profileId: fixture.adult.id,
      subjectId: clone.subjectId,
      topicId: clone.topicId,
      sessionType: 'learning',
      status: 'active',
      exchangeCount: 1,
      escalationRung: 1,
    });

    const undo = await undoCloneFromChild(
      fixture.db,
      fixture.adult.id,
      clone.createdIds,
      SERVICE_OPTS,
    );

    expect(undo).toEqual({
      deleted: { topic: false },
      reason: 'session_started',
    });
    const topic = await fixture.db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, clone.topicId),
    });
    expect(topic?.id).toBe(clone.topicId);
  });

  // -------------------------------------------------------------------------
  // Fresh-topic startRelearn path
  //
  // Source: docs/specs/2026-05-23-learn-this-too-bridge.md
  //   §Relearn Screen Adjustments §1:
  //   "Required: add an integration test that exercises the fresh-topic case
  //    explicitly — clone via bridge → call startRelearn → verify session
  //    created and `needs_deepening_topics` row written — to lock current
  //    behavior against future regression."
  //
  // The bridge deliberately does NOT enqueue or start a session — the adult
  // first sees the cloned topic in Library / on the relearn fresh-topic
  // screen. startRelearn (called when the adult picks a method) is what
  // actually writes the queue row and the learning_sessions row.
  // -------------------------------------------------------------------------

  it('clone via bridge → startRelearn creates session and needs_deepening row', async () => {
    const fixture = await seedFamily();

    const clone = await cloneTopicFromChild(
      fixture.db,
      fixture.adult.id,
      {
        childProfileId: fixture.child.id,
        topicId: fixture.childLearning.topic.id,
        requestId: randomUUID(),
      },
      SERVICE_OPTS,
    );

    expect(clone.topicState).toBe('unstarted');

    // Bridge MUST NOT pre-create the queue row or a session — guards the
    // spec contract that startRelearn is the only writer.
    const preQueue = await fixture.db
      .select()
      .from(needsDeepeningTopics)
      .where(
        and(
          eq(needsDeepeningTopics.profileId, fixture.adult.id),
          eq(needsDeepeningTopics.topicId, clone.topicId),
        ),
      );
    expect(preQueue).toHaveLength(0);

    const preSessions = await fixture.db
      .select()
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, fixture.adult.id),
          eq(learningSessions.topicId, clone.topicId),
        ),
      );
    expect(preSessions).toHaveLength(0);

    const relearn = await startRelearn(fixture.db, fixture.adult.id, {
      topicId: clone.topicId,
      method: 'same',
    });

    expect(relearn.sessionId).toBeTruthy();
    expect(relearn.method).toBe('same');

    const postQueue = await fixture.db
      .select()
      .from(needsDeepeningTopics)
      .where(
        and(
          eq(needsDeepeningTopics.profileId, fixture.adult.id),
          eq(needsDeepeningTopics.topicId, clone.topicId),
          eq(needsDeepeningTopics.status, 'active'),
        ),
      );
    expect(postQueue).toHaveLength(1);
    expect(postQueue[0]?.subjectId).toBe(clone.subjectId);

    const postSessions = await fixture.db
      .select()
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, fixture.adult.id),
          eq(learningSessions.topicId, clone.topicId),
        ),
      );
    expect(postSessions).toHaveLength(1);
    expect(postSessions[0]?.id).toBe(relearn.sessionId);
    expect(postSessions[0]?.status).toBe('active');
    expect(postSessions[0]?.sessionType).toBe('learning');
    expect(postSessions[0]?.subjectId).toBe(clone.subjectId);
  });
});
