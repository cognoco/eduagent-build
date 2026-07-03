import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  guardianship,
  login,
  membership,
  organization,
  person,
  subjects,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { cloneTopicFromChild } from '../../apps/api/src/services/family-bridge';

const EMAIL = 'family-bridge-gdpr@integration.test';
const CLERK_USER_ID = 'integration-family-bridge-gdpr-user';

// [WI-1128] Legacy `accounts`/`profiles`/`family_links` are dropped — this is
// a pure v2 seed now (organization/person/login/membership/guardianship),
// mirroring the already-converted sibling `family-bridge.integration.test.ts`.
async function seedFamilyBridgeTopic() {
  const db = createIntegrationDb();
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
      residenceJurisdiction: 'EU',
    },
    {
      id: childId,
      displayName: 'Ada',
      birthDate: '2013-01-01',
      residenceJurisdiction: 'EU',
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

  const adult = { id: adultId, accountId };
  const child = { id: childId, accountId };

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: child.id,
      name: 'Mathematics',
      rawInput: 'Mathematics',
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
      title: 'Numbers That Matter',
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
      title: 'Fractions',
      description: 'Child provenance should not block deletion.',
      sortOrder: 0,
      estimatedMinutes: 20,
      relevance: 'core',
      source: 'generated',
    })
    .returning();
  if (!topic) throw new Error('Topic seed failed');

  const clone = await cloneTopicFromChild(db, adult.id, {
    childProfileId: child.id,
    topicId: topic.id,
    requestId: randomUUID(),
  });

  return { db, adult, child, clone };
}

beforeEach(async () => {
  await cleanupAccounts({ emails: [EMAIL], clerkUserIds: [CLERK_USER_ID] });
});

afterAll(async () => {
  await cleanupAccounts({ emails: [EMAIL], clerkUserIds: [CLERK_USER_ID] });
});

describe('family bridge GDPR integration', () => {
  it('keeps the adult clone but clears child provenance when the child profile is deleted', async () => {
    const { db, adult, child, clone } = await seedFamilyBridgeTopic();

    const beforeDelete = await db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, clone.topicId),
    });
    expect(beforeDelete?.source).toBe('parent_bridge');
    expect(beforeDelete?.sourceChildProfileId).toBe(child.id);

    // [WI-1128] guardianship is ON DELETE RESTRICT on person (both directions)
    // — must clear the edge before the child `person` row can be deleted.
    await db
      .delete(guardianship)
      .where(
        and(
          eq(guardianship.guardianPersonId, adult.id),
          eq(guardianship.chargePersonId, child.id),
        ),
      );
    await db.delete(person).where(eq(person.id, child.id));

    const afterDelete = await db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, clone.topicId),
    });

    expect(afterDelete?.source).toBe('parent_bridge');
    expect(afterDelete?.sourceChildProfileId).toBeNull();
    expect(afterDelete?.title).toBe('Fractions');
  });
});
