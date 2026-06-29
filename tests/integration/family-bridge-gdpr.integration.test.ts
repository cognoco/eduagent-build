import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  accounts,
  curricula,
  curriculumBooks,
  curriculumTopics,
  familyLinks,
  guardianship,
  profiles,
  subjects,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import { ensureV2IdentityForLegacyProfileTest } from '../../apps/api/src/test-utils/legacy-identity-anchors';
import { cloneTopicFromChild } from '../../apps/api/src/services/family-bridge';

const EMAIL = 'family-bridge-gdpr@integration.test';
const CLERK_USER_ID = 'integration-family-bridge-gdpr-user';

async function seedFamilyBridgeTopic() {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: CLERK_USER_ID, email: EMAIL })
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

  // [WI-1145] Seed the v2 identity graph + guardianship edge unconditionally —
  // cloneTopicFromChild's active-edge guard reads `guardianship` (throwing
  // ForbiddenError on no edge) regardless of the carved flag, so the legacy-only
  // seed fails on the post-collapse flag-off main lane. Same ids as legacy
  // (person.id == profile.id, organization.id == account.id).
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId: account.id,
    profileId: adult.id,
    displayName: 'Parent',
    birthYear: 1985,
    clerkUserId: CLERK_USER_ID,
    email: EMAIL,
    isOwner: true,
  });
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId: account.id,
    profileId: child.id,
    displayName: 'Ada',
    birthYear: 2013,
    clerkUserId: `${CLERK_USER_ID}-child`,
    email: `child-${EMAIL}`,
    isOwner: false,
  });
  await db.insert(guardianship).values({
    guardianPersonId: adult.id,
    chargePersonId: child.id,
  });

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

    await db
      .delete(familyLinks)
      .where(
        and(
          eq(familyLinks.parentProfileId, adult.id),
          eq(familyLinks.childProfileId, child.id),
        ),
      );
    await db.delete(profiles).where(eq(profiles.id, child.id));

    const afterDelete = await db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, clone.topicId),
    });

    expect(afterDelete?.source).toBe('parent_bridge');
    expect(afterDelete?.sourceChildProfileId).toBeNull();
    expect(afterDelete?.title).toBe('Fractions');
  });
});
