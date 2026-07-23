/**
 * Integration: POST /v1/language/speaking-practice/attempts
 *
 * Exercises the exported production app, signed-JWT authentication,
 * account/profile/consent middleware, proxy-write guard, route handler, real
 * speaking-practice service, and isolated database. The only mocked boundary
 * is Clerk JWKS; Neon fetches pass through to the real isolated database.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  generateUUIDv7,
  learningSessions,
  login,
  organization,
  person,
  speakingPracticeAttempts,
  subjects,
} from '@eduagent/database';
import { ERROR_CODES } from '@eduagent/schemas';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from '../../../../tests/integration/helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedLearningSession,
  seedSubject,
} from '../../../../tests/integration/route-fixtures';
import {
  addFetchHandler,
  installFetchInterceptor,
  restoreFetch,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';
import { clearJWKSCache } from '../middleware/jwt';
import { app } from '../index';

const TEST_ENV = buildIntegrationEnv();
const RUN_KEY = generateUUIDv7().replaceAll('-', '').slice(-12);
const PRIMARY_USER = {
  userId: `integration-speaking-route-${RUN_KEY}`,
  email: `speaking-route-${RUN_KEY}@integration.test`,
};
const OTHER_USER = {
  userId: `integration-speaking-route-other-${RUN_KEY}`,
  email: `speaking-route-other-${RUN_KEY}@integration.test`,
};
const FIXTURE_USERS = [PRIMARY_USER, OTHER_USER];

const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));

const createdProfileIds = new Set<string>();
const createdOrganizationIds = new Set<string>();

type FixtureUser = (typeof FIXTURE_USERS)[number];

async function createOwner(user: FixtureUser = PRIMARY_USER) {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user,
    displayName: `Speaking Route ${RUN_KEY}`,
    birthYear: 2000,
  });
  createdProfileIds.add(profile.id);
  createdOrganizationIds.add(profile.accountId);
  return profile;
}

async function createSpeakingFixture(user: FixtureUser = PRIMARY_USER) {
  const profile = await createOwner(user);
  const subject = await seedSubject(
    profile.id,
    `Speaking Practice ${RUN_KEY}`,
    {
      pedagogyMode: 'four_strands',
      languageCode: 'en',
    },
  );
  const sessionId = await seedLearningSession({
    profileId: profile.id,
    subjectId: subject.id,
  });
  return { profile, subject, sessionId };
}

function validAttemptBody(input: {
  sessionId: string;
  subjectId: string;
}): Record<string, string> {
  return {
    sessionId: input.sessionId,
    subjectId: input.subjectId,
    mode: 'repeat_after_me',
    targetText: 'I would like a cup of tea.',
    transcript: 'I like cup tea',
    locale: 'en-US',
  };
}

function postAttempt(input: {
  profileId?: string;
  user?: FixtureUser;
  body: Record<string, unknown>;
  authenticated?: boolean;
}) {
  const user = input.user ?? PRIMARY_USER;
  return app.request(
    '/v1/language/speaking-practice/attempts',
    {
      method: 'POST',
      headers:
        input.authenticated === false
          ? { 'Content-Type': 'application/json' }
          : buildAuthHeaders(
              { sub: user.userId, email: user.email },
              input.profileId,
            ),
      body: JSON.stringify(input.body),
    },
    TEST_ENV,
  );
}

async function cleanupFixtureRows(): Promise<void> {
  await cleanupAccounts({
    emails: FIXTURE_USERS.map((user) => user.email),
    clerkUserIds: FIXTURE_USERS.map((user) => user.userId),
  });
}

async function expectZeroFixtureResidue(): Promise<void> {
  const db = createIntegrationDb();
  const profileIds = [...createdProfileIds];
  const organizationIds = [...createdOrganizationIds];

  const remainingLogins = await db.query.login.findMany({
    where: inArray(
      login.clerkUserId,
      FIXTURE_USERS.map((user) => user.userId),
    ),
    columns: { id: true },
  });
  expect(remainingLogins).toHaveLength(0);

  if (profileIds.length > 0) {
    const [
      remainingPeople,
      remainingSubjects,
      remainingSessions,
      remainingAttempts,
    ] = await Promise.all([
      db.query.person.findMany({
        where: inArray(person.id, profileIds),
        columns: { id: true },
      }),
      db.query.subjects.findMany({
        where: inArray(subjects.profileId, profileIds),
        columns: { id: true },
      }),
      db.query.learningSessions.findMany({
        where: inArray(learningSessions.profileId, profileIds),
        columns: { id: true },
      }),
      db.query.speakingPracticeAttempts.findMany({
        where: inArray(speakingPracticeAttempts.profileId, profileIds),
        columns: { id: true },
      }),
    ]);
    expect(remainingPeople).toHaveLength(0);
    expect(remainingSubjects).toHaveLength(0);
    expect(remainingSessions).toHaveLength(0);
    expect(remainingAttempts).toHaveLength(0);
  }

  if (organizationIds.length > 0) {
    const remainingOrganizations = await db.query.organization.findMany({
      where: inArray(organization.id, organizationIds),
      columns: { id: true },
    });
    expect(remainingOrganizations).toHaveLength(0);
  }
}

beforeEach(async () => {
  jest.clearAllMocks();
  clearJWKSCache();
  await cleanupFixtureRows();
  createdProfileIds.clear();
  createdOrganizationIds.clear();
});

afterEach(async () => {
  await cleanupFixtureRows();
  await expectZeroFixtureResidue();
  createdProfileIds.clear();
  createdOrganizationIds.clear();
});

afterAll(async () => {
  await cleanupFixtureRows();
  restoreFetch();
});

describe('Integration: POST /v1/language/speaking-practice/attempts', () => {
  it('returns 401 UNAUTHORIZED without a signed JWT', async () => {
    const res = await postAttempt({
      authenticated: false,
      body: validAttemptBody({
        sessionId: generateUUIDv7(),
        subjectId: generateUUIDv7(),
      }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Missing or invalid authorization header',
    });
  });

  it('returns 401 before request validation for a malformed unauthenticated body', async () => {
    const res = await postAttempt({
      authenticated: false,
      body: { mode: 'unsupported_mode' },
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Missing or invalid authorization header',
    });
  });

  it('returns 403 FORBIDDEN when X-Profile-Id belongs to another account', async () => {
    const primaryProfile = await createOwner(PRIMARY_USER);
    const otherFixture = await createSpeakingFixture(OTHER_USER);

    const res = await postAttempt({
      profileId: otherFixture.profile.id,
      user: PRIMARY_USER,
      body: validAttemptBody({
        sessionId: otherFixture.sessionId,
        subjectId: otherFixture.subject.id,
      }),
    });

    expect(primaryProfile.id).not.toBe(otherFixture.profile.id);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.FORBIDDEN,
      message: 'Profile does not belong to this account',
    });
  });

  it('returns 403 PROXY_MODE when the write omits an explicit profile binding', async () => {
    const fixture = await createSpeakingFixture();

    const res = await postAttempt({
      body: validAttemptBody({
        sessionId: fixture.sessionId,
        subjectId: fixture.subject.id,
      }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      code: 'PROXY_MODE',
      message: 'Not available in proxy mode',
    });
  });

  it('returns 400 VALIDATION_ERROR for a malformed request without calling the service', async () => {
    const fixture = await createSpeakingFixture();

    const res = await postAttempt({
      profileId: fixture.profile.id,
      body: {
        ...validAttemptBody({
          sessionId: fixture.sessionId,
          subjectId: fixture.subject.id,
        }),
        mode: 'unsupported_mode',
        locale: '',
      },
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      details:
        'sessionId, subjectId, mode, targetText, transcript, and locale are required',
    });

    const db = createIntegrationDb();
    const attempts = await db.query.speakingPracticeAttempts.findMany({
      where: eq(speakingPracticeAttempts.profileId, fixture.profile.id),
    });
    expect(attempts).toHaveLength(0);
  });

  it('returns 201 with the service response and persists the same score under the caller profile', async () => {
    const fixture = await createSpeakingFixture();

    const res = await postAttempt({
      profileId: fixture.profile.id,
      body: validAttemptBody({
        sessionId: fixture.sessionId,
        subjectId: fixture.subject.id,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      attemptNumber: 1,
      // PostgreSQL `real` rounds the computed 4/7 score on persistence; the
      // service deliberately returns that persisted value as source of truth.
      lexicalMatchScore: 0.5714286,
      missingWords: ['would', 'a', 'of'],
      extraWords: [],
      isComplete: false,
    });

    const db = createIntegrationDb();
    const rows = await db.query.speakingPracticeAttempts.findMany({
      where: eq(speakingPracticeAttempts.profileId, fixture.profile.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      profileId: fixture.profile.id,
      subjectId: fixture.subject.id,
      sessionId: fixture.sessionId,
      mode: 'repeat_after_me',
      targetText: 'I would like a cup of tea.',
      transcript: 'I like cup tea',
      locale: 'en-US',
      attemptNumber: body.attemptNumber,
      lexicalMatchScore: body.lexicalMatchScore,
      missingWords: body.missingWords,
      extraWords: body.extraWords,
    });
  });

  it('maps a service SubjectNotFoundError to 404 NOT_FOUND', async () => {
    const fixture = await createSpeakingFixture();

    const res = await postAttempt({
      profileId: fixture.profile.id,
      body: validAttemptBody({
        sessionId: fixture.sessionId,
        subjectId: generateUUIDv7(),
      }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Subject not found',
    });
  });

  it('maps a service LearningSessionNotFoundError to 404 NOT_FOUND', async () => {
    const fixture = await createSpeakingFixture();

    const res = await postAttempt({
      profileId: fixture.profile.id,
      body: validAttemptBody({
        sessionId: generateUUIDv7(),
        subjectId: fixture.subject.id,
      }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Learning session not found',
    });
  });

  it('maps a same-profile cross-subject session mismatch to 404 and writes nothing', async () => {
    const fixture = await createSpeakingFixture();
    const otherSubject = await seedSubject(
      fixture.profile.id,
      `Other Speaking Practice ${RUN_KEY}`,
    );
    const otherSessionId = await seedLearningSession({
      profileId: fixture.profile.id,
      subjectId: otherSubject.id,
    });

    const res = await postAttempt({
      profileId: fixture.profile.id,
      body: validAttemptBody({
        sessionId: otherSessionId,
        subjectId: fixture.subject.id,
      }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Learning session not found',
    });

    const db = createIntegrationDb();
    const rows = await db.query.speakingPracticeAttempts.findMany({
      where: eq(speakingPracticeAttempts.profileId, fixture.profile.id),
    });
    expect(rows).toHaveLength(0);
  });

  it('returns scoped 404 and writes nothing for another profile’s subject and session', async () => {
    const primaryProfile = await createOwner(PRIMARY_USER);
    const otherFixture = await createSpeakingFixture(OTHER_USER);

    const res = await postAttempt({
      profileId: primaryProfile.id,
      user: PRIMARY_USER,
      body: validAttemptBody({
        sessionId: otherFixture.sessionId,
        subjectId: otherFixture.subject.id,
      }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Subject not found',
    });

    const db = createIntegrationDb();
    const rows = await db.query.speakingPracticeAttempts.findMany({
      where: inArray(speakingPracticeAttempts.profileId, [
        primaryProfile.id,
        otherFixture.profile.id,
      ]),
    });
    expect(rows).toHaveLength(0);
  });
});
