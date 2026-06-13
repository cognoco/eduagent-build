jest.mock(
  '../services/subject' /* gc1-allow: unit route classification regression; integration covers real service */,
  () => {
    const actual = jest.requireActual('../services/subject') as Record<
      string,
      unknown
    >;
    return {
      ...actual,
      configureLanguageSubject: jest.fn(),
    };
  },
);

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import {
  configureLanguageSubject,
  SubjectNotLanguageLearningError,
} from '../services/subject';
import { subjectRoutes } from './subjects';

type TestEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    // [WI-177 / DS-088] assertNotProxyMode reads profileMeta on the guarded
    // write handlers; declare it on TestEnv so the typed c.set is accepted.
    profileMeta: { isOwner: boolean } | undefined;
  };
};

const configureLanguageSubjectMock = jest.mocked(configureLanguageSubject);

function createApp() {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', {} as Database);
    c.set('profileId', 'profile-1');
    // [WI-177 / DS-088] assertNotProxyMode now fires on PUT /:id/language-setup
    // and reads profileMeta — mirror production by setting it here. isOwner=true
    // so the guard passes and the error-classification path under test is reached.
    c.set('profileMeta', { isOwner: true });
    await next();
  });
  app.onError((err, c) =>
    c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
  );
  app.route('/v1', subjectRoutes);
  return app;
}

// Valid UUID for the subject param (F-166: PUT /:id/language-setup now validates
// the :id param with zValidator before reaching the service).
const SUBJECT_UUID = 'a0000000-0000-4000-a000-000000000010';

function languageSetupRequest() {
  return createApp().request(`/v1/subjects/${SUBJECT_UUID}/language-setup`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nativeLanguage: 'en', startingLevel: 'A1' }),
  });
}

describe('PUT /subjects/:id/language-setup error classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps the typed non-language subject error to validation failure', async () => {
    configureLanguageSubjectMock.mockRejectedValueOnce(
      new SubjectNotLanguageLearningError(),
    );

    const res = await languageSetupRequest();

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  });

  it('does not classify a generic same-message error as validation failure', async () => {
    const message = 'Subject is not configured for language learning';
    configureLanguageSubjectMock.mockRejectedValueOnce(new Error(message));

    const res = await languageSetupRequest();

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      code: 'INTERNAL_ERROR',
      message,
    });
  });
});
