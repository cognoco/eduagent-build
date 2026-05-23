import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  accounts,
  curricula,
  curriculumBooks,
  curriculumTopics,
  familyLinks,
  learningSessions,
  needsDeepeningTopics,
  profiles,
  subjects,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import {
  cloneTopicFromChild,
  undoCloneFromChild,
} from '../../apps/api/src/services/family-bridge';

type IntegrationDb = ReturnType<typeof createIntegrationDb>;

const EMAIL = 'family-bridge@integration.test';
const CLERK_USER_ID = 'integration-family-bridge-user';

async function seedFamily() {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: CLERK_USER_ID,
      email: EMAIL,
    })
    .returning();

  if (!account) throw new Error('Account seed failed');

  const [adult] = await db
    .insert(profiles)
    .values({
      accountId: account.id,
      displayName: 'Parent',
      birthYear: 1985,
      isOwner: true,
      conversationLanguage: 'en',
    })
    .returning();
  const [child] = await db
    .insert(profiles)
    .values({
      accountId: account.id,
      displayName: 'Ada',
      birthYear: 2013,
      isOwner: false,
      conversationLanguage: 'en',
    })
    .returning();

  if (!adult || !child) throw new Error('Profile seed failed');

  await db.insert(familyLinks).values({
    parentProfileId: adult.id,
    childProfileId: child.id,
  });

  const childLearning = await seedLearningTree(db, {
    profileId: child.id,
    subjectName: 'Mathematics',
    bookTitle: 'Numbers That Matter',
    topicTitle: 'Fractions',
    topicDescription: 'Child version of fractions.',
  });

  return {
    db,
    account,
    adult,
    child,
    childLearning,
  };
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

    const result = await cloneTopicFromChild(fixture.db, fixture.adult.id, {
      childProfileId: fixture.child.id,
      topicId: fixture.childLearning.topic.id,
      requestId: randomUUID(),
    });

    expect(result).toMatchObject({
      subjectId: expect.any(String),
      alreadyExisted: false,
      descriptionDivergent: false,
      descriptionRefreshed: false,
      topicState: 'unstarted',
    });
    expect(result.createdIds.topicId).toBeDefined();
    expect(result.createdIds.subjectId).toBeDefined();
    expect(result.createdIds.bookId).toBeDefined();

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

    const result = await cloneTopicFromChild(fixture.db, fixture.adult.id, {
      childProfileId: fixture.child.id,
      topicId: fixture.childLearning.topic.id,
      requestId: randomUUID(),
    });

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

    const result = await cloneTopicFromChild(fixture.db, fixture.adult.id, {
      childProfileId: fixture.child.id,
      topicId: fixture.childLearning.topic.id,
      requestId: randomUUID(),
    });

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

    const result = await cloneTopicFromChild(fixture.db, fixture.adult.id, {
      childProfileId: fixture.child.id,
      topicId: fixture.childLearning.topic.id,
      requestId: randomUUID(),
    });

    expect(result).toMatchObject({
      topicId: adultLearning.topic.id,
      alreadyExisted: true,
      descriptionDivergent: false,
      descriptionRefreshed: false,
      topicState: 'completed',
    });
  });

  it('force-copies a separate child-named topic when requested', async () => {
    const fixture = await seedFamily();
    await seedLearningTree(fixture.db, {
      profileId: fixture.adult.id,
      subjectName: 'Mathematics',
      bookTitle: 'Numbers That Matter',
      topicTitle: 'Fractions',
      topicDescription: 'Adult existing version.',
    });

    const result = await cloneTopicFromChild(fixture.db, fixture.adult.id, {
      childProfileId: fixture.child.id,
      topicId: fixture.childLearning.topic.id,
      requestId: randomUUID(),
      forceCopy: true,
    });

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

    const first = await cloneTopicFromChild(fixture.db, fixture.adult.id, {
      childProfileId: fixture.child.id,
      topicId: fixture.childLearning.topic.id,
      requestId,
    });
    const second = await cloneTopicFromChild(fixture.db, fixture.adult.id, {
      childProfileId: fixture.child.id,
      topicId: fixture.childLearning.topic.id,
      requestId,
    });

    expect(second).toEqual(first);
    expect(
      await countAdultTopics(fixture.db, fixture.adult.id, 'Fractions'),
    ).toBe(1);
  });

  it('undo deletes a newly cloned bridge topic before learning starts', async () => {
    const fixture = await seedFamily();
    const clone = await cloneTopicFromChild(fixture.db, fixture.adult.id, {
      childProfileId: fixture.child.id,
      topicId: fixture.childLearning.topic.id,
      requestId: randomUUID(),
    });

    const undo = await undoCloneFromChild(
      fixture.db,
      fixture.adult.id,
      clone.createdIds,
    );

    expect(undo).toEqual({ deleted: { topic: true } });
    const topic = await fixture.db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, clone.topicId),
    });
    expect(topic).toBeUndefined();
  });

  it('undo refuses to delete a bridge topic once a session references it', async () => {
    const fixture = await seedFamily();
    const clone = await cloneTopicFromChild(fixture.db, fixture.adult.id, {
      childProfileId: fixture.child.id,
      topicId: fixture.childLearning.topic.id,
      requestId: randomUUID(),
    });
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
});
