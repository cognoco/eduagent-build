import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '@eduagent/database';
import { ERROR_CODES, ForbiddenError } from '@eduagent/schemas';

import { scopesRoutes } from './scopes';
import { resolveScopesForPerson } from '../services/scope-resolution';
import { readSupporteeStructuralSubjects } from '../services/supporter-structural-mask';

jest.mock(
  '../services/scope-resolution' /* gc1-allow: route unit test - service has direct unit coverage */,
  () => ({ resolveScopesForPerson: jest.fn() }),
);

jest.mock(
  '../services/supporter-structural-mask' /* gc1-allow: route unit test - service has direct unit coverage */,
  () => ({ readSupporteeStructuralSubjects: jest.fn() }),
);

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const CHILD_ID = '00000000-0000-4000-8000-000000000101';
const EDGE_ID = '00000000-0000-4000-8000-000000000201';

function makeApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, { marker: 'db' } as unknown as Database);
    c.set('profileId' as never, PROFILE_ID);
    await next();
  });
  app.route('/v1', scopesRoutes);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof ForbiddenError) {
      return c.json({ code: ERROR_CODES.FORBIDDEN, message: err.message }, 403);
    }
    throw err;
  });
  return app;
}

describe('scopes routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /scopes returns the resolved scope list for the active person', async () => {
    jest.mocked(resolveScopesForPerson).mockResolvedValue({
      shape: 'supporter',
      defaultScopeIndex: 0,
      scopes: [
        { kind: 'supporter-hub' },
        {
          kind: 'person',
          personId: CHILD_ID,
          edgeId: EDGE_ID,
          displayName: 'Emma',
        },
      ],
    });

    const res = await makeApp().request('/v1/scopes');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      shape: 'supporter',
      defaultScopeIndex: 0,
      scopes: [
        { kind: 'supporter-hub' },
        {
          kind: 'person',
          personId: CHILD_ID,
          edgeId: EDGE_ID,
          displayName: 'Emma',
        },
      ],
    });
    expect(resolveScopesForPerson).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
    );
  });

  it('GET /scopes/:personId/subjects validates UUID params before service work', async () => {
    const res = await makeApp().request('/v1/scopes/not-a-uuid/subjects');

    expect(res.status).toBe(400);
    expect(readSupporteeStructuralSubjects).not.toHaveBeenCalled();
  });

  it('GET /scopes/:personId/subjects delegates active-edge structural reads', async () => {
    jest.mocked(readSupporteeStructuralSubjects).mockResolvedValue({
      personId: CHILD_ID,
      edgeId: EDGE_ID,
      subjects: [],
    });

    const res = await makeApp().request(`/v1/scopes/${CHILD_ID}/subjects`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      personId: CHILD_ID,
      edgeId: EDGE_ID,
      subjects: [],
    });
    expect(readSupporteeStructuralSubjects).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      CHILD_ID,
    );
  });

  it('GET /scopes/:personId/subjects returns 403 for unlinked people', async () => {
    jest
      .mocked(readSupporteeStructuralSubjects)
      .mockRejectedValue(new ForbiddenError('No edge'));

    const res = await makeApp().request(`/v1/scopes/${CHILD_ID}/subjects`);

    expect(res.status).toBe(403);
  });
});
