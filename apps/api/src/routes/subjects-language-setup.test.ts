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
  };
};

const configureLanguageSubjectMock = jest.mocked(configureLanguageSubject);

function createApp() {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', {} as Database);
    c.set('profileId', 'profile-1');
    await next();
  });
  app.onError((err, c) =>
    c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
  );
  app.route('/v1', subjectRoutes);
  return app;
}

function languageSetupRequest() {
  return createApp().request('/v1/subjects/subject-1/language-setup', {
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
