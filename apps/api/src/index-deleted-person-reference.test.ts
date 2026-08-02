import { DrizzleQueryError } from 'drizzle-orm/errors';
import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { appErrorHandler, type Env } from './index';

const TEST_ENV: Env['Bindings'] = {
  ENVIRONMENT: 'test',
  DATABASE_URL: 'postgres://unused',
};

function foreignKeyViolation(constraint: string): DrizzleQueryError {
  return new DrizzleQueryError(
    'insert',
    [],
    Object.assign(new Error('foreign key violation'), {
      code: '23503',
      constraint,
    }),
  );
}

function buildThrowingApp(error: Error) {
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  app.get('/throws', () => {
    throw error;
  });
  return app;
}

describe('global deleted-person FK boundary', () => {
  it('[WI-2788] maps a known stale-person write to a retry-stopping conflict', async () => {
    const app = buildThrowingApp(
      foreignKeyViolation('activation_events_profile_id_person_id_fk'),
    );

    const response = await app.request('/throws', {}, TEST_ENV);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: ERROR_CODES.CONFLICT,
      message: 'This profile was deleted. Please sign in again.',
    });
  });

  it('[WI-2788] leaves unrelated foreign-key violations as internal errors', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const app = buildThrowingApp(
      foreignKeyViolation('guardianship_charge_person_id_person_id_fk'),
    );

    try {
      const response = await app.request('/throws', {}, TEST_ENV);
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        code: ERROR_CODES.INTERNAL_ERROR,
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
