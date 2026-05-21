/**
 * Integration: GET /v1/subjects/:subjectId/cefr-progress
 *
 * Exercises the real app stack end-to-end — auth, profile-scope middleware,
 * route handler, and `getCurrentLanguageProgress` service — against a real
 * database. No internal mocks.
 *
 * External boundaries mocked (per GC1/test rules):
 *   - Clerk JWKS (fetch interceptor)
 *   - Neon HTTP passthrough (native fetch fallback)
 */

import {
  buildIntegrationEnv,
  cleanupAccounts,
} from '../../../../tests/integration/helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedSubject,
} from '../../../../tests/integration/route-fixtures';
import {
  installFetchInterceptor,
  restoreFetch,
  addFetchHandler,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';
import { clearJWKSCache } from '../middleware/jwt';
import { ERROR_CODES } from '@eduagent/schemas';
import {
  curricula,
  curriculumBooks,
  curriculumTopics,
} from '@eduagent/database';
import { createIntegrationDb } from '../../../../tests/integration/helpers';

import { app } from '../index';

// ---------------------------------------------------------------------------
// Test env + external-boundary intercepts
// ---------------------------------------------------------------------------

const TEST_ENV = buildIntegrationEnv();

const AUTH_USER_ID = 'integration-lang-progress-user';
const AUTH_EMAIL = 'integration-lang-progress@integration.test';

const OTHER_USER_ID = 'integration-lang-progress-other';
const OTHER_EMAIL = 'integration-lang-progress-other@integration.test';

// Real JWT verification + Clerk JWKS interceptor (external boundary).
const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
addFetchHandler(/\.neon\.tech/, (url: string, init: RequestInit | undefined) =>
  nativeFetch(url, init),
);

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/**
 * Seeds a language (four_strands) subject with one curriculum milestone so
 * `getCurrentLanguageProgress` returns a non-null result with a currentMilestone.
 */
async function seedLanguageSubjectWithProgress(profileId: string): Promise<{
  subjectId: string;
  curriculumId: string;
  bookId: string;
  topicId: string;
}> {
  const db = createIntegrationDb();

  const { id: subjectId } = await seedSubject(
    profileId,
    'Spanish Integration',
    {
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    },
  );

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId, version: 1 })
    .returning();
  if (!curriculum) throw new Error('curricula insert did not return a row');

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: 'Spanish',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning();
  if (!book) throw new Error('curriculumBooks insert did not return a row');

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      bookId: book.id,
      title: 'Greetings & Introductions',
      description: 'Meet people and share simple personal details.',
      sortOrder: 0,
      relevance: 'core',
      source: 'generated',
      estimatedMinutes: 30,
      cefrLevel: 'A1',
      cefrSublevel: '1',
      targetWordCount: 45,
      targetChunkCount: 10,
    })
    .returning();
  if (!topic) throw new Error('curriculumTopics insert did not return a row');

  return {
    subjectId,
    curriculumId: curriculum.id,
    bookId: book.id,
    topicId: topic.id,
  };
}

/**
 * Seeds a language subject for `profileId` but returns NO curriculum rows,
 * so `getCurrentLanguageProgress` returns a minimal result without a
 * currentMilestone (still non-null — the service returns a shell object).
 * Use for the "no progress" scenario by seeding with wrong mode instead.
 */
async function seedNonLanguageSubject(profileId: string): Promise<string> {
  const { id } = await seedSubject(profileId, 'History Integration', {
    pedagogyMode: 'socratic',
    languageCode: null,
  });
  return id;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let profileId: string;
let otherProfileId: string;

beforeEach(async () => {
  clearJWKSCache();
  await cleanupAccounts({
    emails: [AUTH_EMAIL, OTHER_EMAIL],
    clerkUserIds: [AUTH_USER_ID, OTHER_USER_ID],
  });

  // Create the primary test profile
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: { userId: AUTH_USER_ID, email: AUTH_EMAIL },
    displayName: 'Language Progress Tester',
    birthYear: 2000,
  });
  profileId = profile.id;

  // Create a second profile for cross-profile scoping tests
  const otherProfile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: { userId: OTHER_USER_ID, email: OTHER_EMAIL },
    displayName: 'Other User',
    birthYear: 1995,
  });
  otherProfileId = otherProfile.id;
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL, OTHER_EMAIL],
    clerkUserIds: [AUTH_USER_ID, OTHER_USER_ID],
  });
  restoreFetch();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: GET /v1/subjects/:subjectId/cefr-progress', () => {
  it('returns 200 with schema-shaped LanguageProgress when progress exists', async () => {
    const { subjectId } = await seedLanguageSubjectWithProgress(profileId);

    const res = await app.request(
      `/v1/subjects/${subjectId}/cefr-progress`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.subjectId).toBe(subjectId);
    expect(body.pedagogyMode).toBe('four_strands');
    expect(body.languageCode).toBe('es');
    // Service populates currentLevel from the seeded milestone
    expect(body.currentLevel).toBe('A1');
    expect(body.currentMilestone).not.toBeNull();
    expect(
      (body.currentMilestone as Record<string, unknown>).milestoneTitle,
    ).toBe('Greetings & Introductions');
  });

  it('returns 404 when the subject exists but is not a language subject (no progress row)', async () => {
    // A socratic subject → getCurrentLanguageProgress returns null → 404
    const subjectId = await seedNonLanguageSubject(profileId);

    const res = await app.request(
      `/v1/subjects/${subjectId}/cefr-progress`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(404);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(body.message).toBe('Language progress not found');
  });

  it('returns 404 when the subject belongs to a different profile (scoped repo enforces isolation)', async () => {
    // Seed subject under the OTHER profile, then request it as the primary user
    const { subjectId: otherSubjectId } =
      await seedLanguageSubjectWithProgress(otherProfileId);

    const res = await app.request(
      `/v1/subjects/${otherSubjectId}/cefr-progress`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: AUTH_USER_ID, email: AUTH_EMAIL },
          profileId, // primary user's profile, NOT the subject owner
        ),
      },
      TEST_ENV,
    );

    // getCurrentLanguageProgress checks eq(subjects.profileId, profileId);
    // the subject is invisible to the requesting profile → null → 404
    expect(res.status).toBe(404);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('returns 401 when the request has no JWT', async () => {
    const { subjectId } = await seedLanguageSubjectWithProgress(profileId);

    const res = await app.request(
      `/v1/subjects/${subjectId}/cefr-progress`,
      {
        method: 'GET',
        // No Authorization header
      },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });
});
