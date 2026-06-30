// ---------------------------------------------------------------------------
// [BUG-863] undoCloneFromChild must cascade the undo to orphan ancestors.
//
// cloneTopicFromChild returns createdIds = { subjectId?, bookId?, topicId? };
// the ancestor ids are populated ONLY when the clone had to CREATE those
// ancestors (first clone into a brand-new subject). The original
// undoCloneFromChild deleted only createdIds.topicId, so undoing the first
// clone in a freshly-created subject left an orphan subject + book on the
// parent's account with no UI affordance to clean up.
//
// These are real-DB integration tests (no internal mocks). They seed the v2
// identity graph (person/organization/login/membership/guardianship) plus the
// legacy profile anchors still required by learning-table FKs, then drive
// cloneTopicFromChild → undoCloneFromChild through the real service.
//
// Red-before / green-after: against the pre-fix undoCloneFromChild (topic-only
// delete), the "deletes the orphan subject AND book" case is RED (the orphan
// subject + book persist); with the cascade fix it is GREEN. The
// "must NOT delete a pre-existing non-empty subject" case guards the empty /
// this-clone-created-only constraint so the cascade never over-deletes.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  curricula,
  curriculumBooks,
  curriculumTopics,
  guardianship,
  organization,
  person,
  subjects,
  type Database,
} from '@eduagent/database';

import {
  cleanupAccounts,
  createIntegrationDb,
} from '../../../../tests/integration/helpers';
import {
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { cloneTopicFromChild, undoCloneFromChild } from './family-bridge';

const RUN = !!process.env.DATABASE_URL;
// [WI-867] assertParentAccess → validateGuardianChargeRelationshipV2 unconditionally.
const SERVICE_OPTS = { identityV2Enabled: true };

const EMAIL = 'family-bridge-undo-orphan@integration.test';
const CLERK_USER_ID = 'integration-family-bridge-undo-orphan-user';

type Fixture = {
  db: Database;
  accountId: string;
  adultId: string;
  childId: string;
  childTopicId: string;
};

async function seedLearningTree(
  db: Database,
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

async function seedFamily(): Promise<Fixture> {
  const db = createIntegrationDb();
  await cleanupAccounts({ emails: [EMAIL], clerkUserIds: [CLERK_USER_ID] });

  const accountId = randomUUID();
  const adultId = randomUUID();
  const childId = randomUUID();

  // [WI-867] v2 identity graph is unconditional. Learning tables still FK to
  // profiles.id so legacy anchors are also needed.
  await ensureLegacyProfileAnchorForTest(db, {
    profileId: adultId,
    accountId,
    displayName: 'Parent',
    birthYear: 1985,
    isOwner: true,
    email: EMAIL,
    clerkUserId: CLERK_USER_ID,
  });
  await ensureLegacyProfileAnchorForTest(db, {
    profileId: childId,
    accountId,
    displayName: 'Ada',
    birthYear: 2013,
    isOwner: false,
  });

  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId: adultId,
    displayName: 'Parent',
    birthYear: 1985,
    clerkUserId: CLERK_USER_ID,
    email: EMAIL,
    isOwner: true,
  });
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId: childId,
    displayName: 'Ada',
    birthYear: 2013,
    clerkUserId: `${CLERK_USER_ID}-child`,
    email: `child-${EMAIL}`,
    isOwner: false,
  });
  // resolveSubject() reads person.conversation_language to stamp the cloned subject.
  await db
    .update(person)
    .set({ conversationLanguage: 'en' })
    .where(eq(person.id, adultId));
  await db.insert(guardianship).values({
    guardianPersonId: adultId,
    chargePersonId: childId,
  });

  const childLearning = await seedLearningTree(db, {
    profileId: childId,
    subjectName: 'Mathematics',
    bookTitle: 'Numbers That Matter',
    topicTitle: 'Fractions',
    topicDescription: 'Child version of fractions.',
  });

  return {
    db,
    accountId,
    adultId,
    childId,
    childTopicId: childLearning.topic.id,
  };
}

async function teardown(fixture: Fixture) {
  const db = fixture.db;
  // Subjects owned by either person (and their cascade children) first, so the
  // person/org delete is not blocked by FKs through subjects.profile_id.
  await db.delete(subjects).where(eq(subjects.profileId, fixture.childId));
  await db.delete(subjects).where(eq(subjects.profileId, fixture.adultId));
  // [WI-867] v2 identity cleanup is unconditional.
  await db
    .delete(guardianship)
    .where(eq(guardianship.guardianPersonId, fixture.adultId));
  await deleteV2IdentitiesForTest(db, {
    accountIds: [fixture.accountId],
    profileIds: [fixture.adultId, fixture.childId],
  });
  await db.delete(organization).where(eq(organization.id, fixture.accountId));
  await cleanupAccounts({ emails: [EMAIL], clerkUserIds: [CLERK_USER_ID] });
}

async function adultSubjectByName(
  db: Database,
  adultProfileId: string,
  name: string,
) {
  const [row] = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.profileId, adultProfileId), eq(subjects.name, name)))
    .limit(1);
  return row ?? null;
}

(RUN ? describe : describe.skip)(
  'undoCloneFromChild orphan cascade (BUG-863)',
  () => {
    it('deletes the orphan subject AND book when undoing the first clone into a freshly-created subject', async () => {
      const fixture = await seedFamily();
      try {
        const clone = await cloneTopicFromChild(
          fixture.db,
          fixture.adultId,
          {
            childProfileId: fixture.childId,
            topicId: fixture.childTopicId,
            requestId: randomUUID(),
          },
          SERVICE_OPTS,
        );

        // Precondition: this clone created the full ancestor chain.
        expect(clone.createdIds.topicId).toBeDefined();
        expect(clone.createdIds.bookId).toBeDefined();
        expect(clone.createdIds.subjectId).toBeDefined();

        const undo = await undoCloneFromChild(
          fixture.db,
          fixture.adultId,
          clone.createdIds,
        );
        expect(undo.deleted.topic).toBe(true);

        // The topic is gone.
        const topic = await fixture.db.query.curriculumTopics.findFirst({
          where: eq(curriculumTopics.id, clone.topicId),
        });
        expect(topic).toBeUndefined();

        // The orphan book is gone.
        const book = await fixture.db.query.curriculumBooks.findFirst({
          where: eq(curriculumBooks.id, clone.createdIds.bookId!),
        });
        expect(book).toBeUndefined();

        // The orphan subject is gone.
        const subject = await fixture.db.query.subjects.findFirst({
          where: eq(subjects.id, clone.createdIds.subjectId!),
        });
        expect(subject).toBeUndefined();
      } finally {
        await teardown(fixture);
      }
    });

    it('does NOT delete a pre-existing non-empty subject the clone merely reused', async () => {
      const fixture = await seedFamily();
      try {
        // The adult already owns a "Mathematics" subject with its own book/topic.
        // The clone resolves into this existing subject (created=false), so
        // createdIds.subjectId is NOT set — undo must leave the subject intact.
        const adultExisting = await seedLearningTree(fixture.db, {
          profileId: fixture.adultId,
          subjectName: 'Mathematics',
          bookTitle: "Parent's Own Book",
          topicTitle: 'Decimals',
          topicDescription: "Parent's own decimals topic.",
        });

        const clone = await cloneTopicFromChild(
          fixture.db,
          fixture.adultId,
          {
            childProfileId: fixture.childId,
            topicId: fixture.childTopicId,
            requestId: randomUUID(),
          },
          SERVICE_OPTS,
        );

        // Reused the existing subject → no ancestor subject created, but the
        // child's book did not exist in the adult's subject, so the clone
        // CREATED a new book — the partial-cascade case the undo must clean up.
        expect(clone.createdIds.subjectId).toBeUndefined();
        expect(clone.createdIds.bookId).toBeDefined();

        const undo = await undoCloneFromChild(
          fixture.db,
          fixture.adultId,
          clone.createdIds,
        );
        expect(undo.deleted.topic).toBe(true);

        // The clone-created orphan book is gone (book-delete cascade ran).
        const clonedBook = await fixture.db.query.curriculumBooks.findFirst({
          where: eq(curriculumBooks.id, clone.createdIds.bookId!),
        });
        expect(clonedBook).toBeUndefined();

        // The pre-existing subject and its own book/topic survive.
        const subject = await adultSubjectByName(
          fixture.db,
          fixture.adultId,
          'Mathematics',
        );
        expect(subject?.id).toBe(adultExisting.subject.id);

        const ownBook = await fixture.db.query.curriculumBooks.findFirst({
          where: eq(curriculumBooks.id, adultExisting.book.id),
        });
        expect(ownBook?.id).toBe(adultExisting.book.id);

        const ownTopic = await fixture.db.query.curriculumTopics.findFirst({
          where: eq(curriculumTopics.id, adultExisting.topic.id),
        });
        expect(ownTopic?.id).toBe(adultExisting.topic.id);
      } finally {
        await teardown(fixture);
      }
    });
  },
);
