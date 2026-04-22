/**
 * Integration: Note routes
 *
 * Exercises the real note routes through the full app + real database.
 * Real JWT verification via the global fetch interceptor in setup.ts.
 */

import { and, eq } from 'drizzle-orm';
import { topicNotes } from '@eduagent/database';

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  getIntegrationDb,
  seedCurriculum,
  seedSubject,
  seedTopicNote,
} from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const NOTES_USER = {
  userId: 'integration-notes-user',
  email: 'integration-notes@integration.test',
};
const OTHER_NOTES_USER = {
  userId: 'integration-notes-other-user',
  email: 'integration-notes-other@integration.test',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [NOTES_USER.email, OTHER_NOTES_USER.email],
    clerkUserIds: [NOTES_USER.userId, OTHER_NOTES_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [NOTES_USER.email, OTHER_NOTES_USER.email],
    clerkUserIds: [NOTES_USER.userId, OTHER_NOTES_USER.userId],
  });
});

async function createTopicFixture() {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: NOTES_USER,
    displayName: 'Notes Learner',
    birthYear: 2008,
  });
  const subject = await seedSubject(profile.id, 'History');
  const curriculum = await seedCurriculum({
    subjectId: subject.id,
    topics: [
      { title: 'Ancient Egypt', sortOrder: 0 },
      { title: 'Roman Empire', sortOrder: 1 },
    ],
  });

  return {
    profile,
    subject,
    bookId: curriculum.bookId,
    topicId: curriculum.topicIds[0]!,
    secondTopicId: curriculum.topicIds[1]!,
  };
}

describe('Integration: note routes', () => {
  it('returns notes for a book using the real DB rows', async () => {
    const { profile, subject, bookId, topicId, secondTopicId } =
      await createTopicFixture();
    await seedTopicNote({
      profileId: profile.id,
      topicId,
      content: 'My notes about pyramids',
    });
    await seedTopicNote({
      profileId: profile.id,
      topicId: secondTopicId,
      content: 'Roman roads made movement faster',
    });

    const res = await app.request(
      `/v1/subjects/${subject.id}/books/${bookId}/notes`,
      {
        method: 'GET',
        headers: buildAuthHeaders({
          sub: NOTES_USER.userId,
          email: NOTES_USER.email,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toHaveLength(2);
    expect(body.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicId,
          content: 'My notes about pyramids',
        }),
        expect.objectContaining({
          topicId: secondTopicId,
          content: 'Roman roads made movement faster',
        }),
      ])
    );
  });

  it('returns null when no note exists for the topic', async () => {
    const { profile, subject, topicId } = await createTopicFixture();

    const res = await app.request(
      `/v1/subjects/${subject.id}/topics/${topicId}/note`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: NOTES_USER.userId, email: NOTES_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toBeNull();
  });

  it('creates and appends to a note with real persistence', async () => {
    const { profile, subject, topicId } = await createTopicFixture();

    const createRes = await app.request(
      `/v1/subjects/${subject.id}/topics/${topicId}/note`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: NOTES_USER.userId, email: NOTES_USER.email },
          profile.id
        ),
        body: JSON.stringify({ content: 'First line' }),
      },
      TEST_ENV
    );

    expect(createRes.status).toBe(200);
    const createdBody = await createRes.json();
    expect(createdBody.note.content).toBe('First line');

    const appendRes = await app.request(
      `/v1/subjects/${subject.id}/topics/${topicId}/note`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: NOTES_USER.userId, email: NOTES_USER.email },
          profile.id
        ),
        body: JSON.stringify({
          content: 'Second line',
          append: true,
        }),
      },
      TEST_ENV
    );

    expect(appendRes.status).toBe(200);
    const appendedBody = await appendRes.json();
    expect(appendedBody.note.content).toBe('First line\nSecond line');

    const db = getIntegrationDb();
    const saved = await db.query.topicNotes.findFirst({
      where: and(
        eq(topicNotes.profileId, profile.id),
        eq(topicNotes.topicId, topicId)
      ),
    });
    expect(saved?.content).toBe('First line\nSecond line');
  });

  it('returns 400 for invalid note input', async () => {
    const { profile, subject, topicId } = await createTopicFixture();

    const res = await app.request(
      `/v1/subjects/${subject.id}/topics/${topicId}/note`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: NOTES_USER.userId, email: NOTES_USER.email },
          profile.id
        ),
        body: JSON.stringify({ content: '' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid topic id', async () => {
    const { profile, subject } = await createTopicFixture();

    const res = await app.request(
      `/v1/subjects/${subject.id}/topics/not-a-uuid/note`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: NOTES_USER.userId, email: NOTES_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns topic ids that have notes', async () => {
    const { profile, topicId, secondTopicId } = await createTopicFixture();
    await seedTopicNote({
      profileId: profile.id,
      topicId,
      content: 'One',
    });
    await seedTopicNote({
      profileId: profile.id,
      topicId: secondTopicId,
      content: 'Two',
    });

    const res = await app.request(
      '/v1/notes/topic-ids',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: NOTES_USER.userId, email: NOTES_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topicIds).toEqual(
      expect.arrayContaining([topicId, secondTopicId])
    );
  });

  it('deletes a note and removes it from the database', async () => {
    const { profile, subject, topicId } = await createTopicFixture();
    await seedTopicNote({
      profileId: profile.id,
      topicId,
      content: 'Delete me',
    });

    const res = await app.request(
      `/v1/subjects/${subject.id}/topics/${topicId}/note`,
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          { sub: NOTES_USER.userId, email: NOTES_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(204);

    const db = getIntegrationDb();
    const deleted = await db.query.topicNotes.findFirst({
      where: and(
        eq(topicNotes.profileId, profile.id),
        eq(topicNotes.topicId, topicId)
      ),
    });
    expect(deleted).toBeUndefined();
  });

  it('returns 404 when deleting a note that does not exist', async () => {
    const { profile, subject, topicId } = await createTopicFixture();

    const res = await app.request(
      `/v1/subjects/${subject.id}/topics/${topicId}/note`,
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          { sub: NOTES_USER.userId, email: NOTES_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
  });

  it('returns 404 when the topic belongs to another profile', async () => {
    const profile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: NOTES_USER,
      displayName: 'Owner A',
      birthYear: 2008,
    });
    const otherProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: OTHER_NOTES_USER,
      displayName: 'Owner B',
      birthYear: 2008,
    });
    const otherSubject = await seedSubject(otherProfile.id, 'Chemistry');
    const otherCurriculum = await seedCurriculum({
      subjectId: otherSubject.id,
      topics: [{ title: 'Atoms', sortOrder: 0 }],
    });

    const res = await app.request(
      `/v1/subjects/${otherSubject.id}/topics/${otherCurriculum.topicIds[0]}/note`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: NOTES_USER.userId, email: NOTES_USER.email },
          profile.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request(
      '/v1/notes/topic-ids',
      { method: 'GET' },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});
