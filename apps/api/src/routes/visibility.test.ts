jest.mock(
  '../services/linking-ceremony' /* gc1-allow: route-boundary unit test - service internals have direct service/integration coverage; this file verifies zValidator/context gates stop before delegation */,
  () => ({
    initiateLink: jest.fn(),
    acceptLink: jest.fn(),
    findAcceptedContractForSupportee: jest.fn(),
    getContractForVisibleLink: jest.fn(),
    writeVisibilityAuditEvent: jest.fn(),
  }),
);

jest.mock(
  '../services/supportership-revocation' /* gc1-allow: route-boundary unit test - service internals have direct service/integration coverage; this file verifies param/context gates stop before delegation */,
  () => ({ requestSelfUnlink: jest.fn() }),
);

jest.mock(
  '../services/supporter-report' /* gc1-allow: route-boundary unit test - service internals have direct service coverage; this file verifies report route validation gates stop before delegation */,
  () => ({ buildAttentionReport: jest.fn() }),
);

jest.mock(
  '../services/shared-record-read-model' /* gc1-allow: route-boundary unit test - service internals have direct service coverage; this file verifies shared-record route validation gates stop before delegation */,
  () => ({ readSharedRecordForSupportee: jest.fn() }),
);

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { Database } from '@eduagent/database';
import {
  BadRequestError,
  ERROR_CODES,
  ForbiddenError,
} from '@eduagent/schemas';

import { visibilityRoutes } from './visibility';
import {
  acceptLink,
  findAcceptedContractForSupportee,
  getContractForVisibleLink,
  initiateLink,
} from '../services/linking-ceremony';
import { requestSelfUnlink } from '../services/supportership-revocation';
import { buildAttentionReport } from '../services/supporter-report';
import { readSharedRecordForSupportee } from '../services/shared-record-read-model';
import type { AuthUser } from '../middleware/auth';

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SUPPORTER_PERSON_ID = '00000000-0000-4000-8000-000000000101';
const SUPPORTEE_PERSON_ID = '00000000-0000-4000-8000-000000000102';
const CONTRACT_ID = '00000000-0000-4000-8000-000000000201';
const SUPPORTERSHIP_ID = '00000000-0000-4000-8000-000000000301';

type TestEnv = {
  Bindings: {
    MANAGED_TIER_ACTIVE?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    callerPersonId: string | undefined;
  };
};

type RequestCase = {
  name: string;
  path: string;
  init?: RequestInit;
};

const jsonHeaders = { 'Content-Type': 'application/json' };

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  };
}

function makeInitiateBody(overrides: Record<string, unknown> = {}) {
  return {
    supporterPersonId: SUPPORTER_PERSON_ID,
    supporteePersonId: SUPPORTEE_PERSON_ID,
    relation: 'teacher',
    ...overrides,
  };
}

function makeAcceptBody(overrides: Record<string, unknown> = {}) {
  return {
    actorPersonId: SUPPORTER_PERSON_ID,
    audience: 'supporter',
    ...overrides,
  };
}

function makeApp(
  options: {
    profileId?: string;
    callerPersonId?: string;
  } = {},
) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', { marker: 'db' } as unknown as Database);
    c.set('user', { userId: 'user-test', email: 'test@example.com' });
    if (options.profileId !== undefined) {
      c.set('profileId', options.profileId);
    }
    if (options.callerPersonId !== undefined) {
      c.set('callerPersonId', options.callerPersonId);
    }
    await next();
  });
  app.route('/v1', visibilityRoutes);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof BadRequestError) {
      return c.json(
        { code: ERROR_CODES.VALIDATION_ERROR, message: err.message },
        400,
      );
    }
    if (err instanceof ForbiddenError) {
      return c.json({ code: ERROR_CODES.FORBIDDEN, message: err.message }, 403);
    }
    throw err;
  });
  return app;
}

function validRouteCases(): RequestCase[] {
  return [
    {
      name: 'POST /visibility/links',
      path: '/v1/visibility/links',
      init: postJson(makeInitiateBody()),
    },
    {
      name: 'POST /visibility/links/:id/accept',
      path: `/v1/visibility/links/${CONTRACT_ID}/accept`,
      init: postJson(makeAcceptBody()),
    },
    {
      name: 'POST /visibility/links/:id/revoke',
      path: `/v1/visibility/links/${SUPPORTERSHIP_ID}/revoke`,
      init: { method: 'POST' },
    },
    {
      name: 'GET /visibility/links/:id/contract',
      path: `/v1/visibility/links/${CONTRACT_ID}/contract`,
    },
    {
      name: 'POST /visibility/reports/:personId/appeal',
      path: `/v1/visibility/reports/${SUPPORTEE_PERSON_ID}/appeal`,
      init: postJson({ reason: 'Please review this report.' }),
    },
    {
      name: 'GET /visibility/reports/:personId/shared-record',
      path: `/v1/visibility/reports/${SUPPORTEE_PERSON_ID}/shared-record`,
    },
  ];
}

function expectNoVisibilityServiceCalls() {
  expect(initiateLink).not.toHaveBeenCalled();
  expect(acceptLink).not.toHaveBeenCalled();
  expect(requestSelfUnlink).not.toHaveBeenCalled();
  expect(getContractForVisibleLink).not.toHaveBeenCalled();
  expect(findAcceptedContractForSupportee).not.toHaveBeenCalled();
  expect(buildAttentionReport).not.toHaveBeenCalled();
  expect(readSharedRecordForSupportee).not.toHaveBeenCalled();
}

describe('visibility routes boundary validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      name: 'POST /visibility/links/:id/accept',
      path: '/v1/visibility/links/not-a-uuid/accept',
      init: postJson(makeAcceptBody()),
      service: acceptLink,
    },
    {
      name: 'POST /visibility/links/:id/revoke',
      path: '/v1/visibility/links/not-a-uuid/revoke',
      init: { method: 'POST' },
      service: requestSelfUnlink,
    },
    {
      name: 'GET /visibility/links/:id/contract',
      path: '/v1/visibility/links/not-a-uuid/contract',
      service: getContractForVisibleLink,
    },
    {
      name: 'POST /visibility/reports/:personId/appeal',
      path: '/v1/visibility/reports/not-a-uuid/appeal',
      init: postJson({ reason: 'Please review this report.' }),
      service: findAcceptedContractForSupportee,
    },
    {
      name: 'GET /visibility/reports/:personId/shared-record',
      path: '/v1/visibility/reports/not-a-uuid/shared-record',
      service: findAcceptedContractForSupportee,
    },
  ] as const)(
    '$name returns 400 for invalid UUID params before service work',
    async ({ path, init, service }) => {
      const res = await makeApp({
        profileId: PROFILE_ID,
        callerPersonId: SUPPORTER_PERSON_ID,
      }).request(path, init);

      expect(res.status).toBe(400);
      expect(service).not.toHaveBeenCalled();
      expectNoVisibilityServiceCalls();
    },
  );

  it.each([
    {
      name: 'POST /visibility/links',
      path: '/v1/visibility/links',
      init: postJson(makeInitiateBody({ supporterPersonId: 'not-a-uuid' })),
      service: initiateLink,
    },
    {
      name: 'POST /visibility/links/:id/accept',
      path: `/v1/visibility/links/${CONTRACT_ID}/accept`,
      init: postJson(makeAcceptBody({ actorPersonId: 'not-a-uuid' })),
      service: acceptLink,
    },
    {
      name: 'POST /visibility/reports/:personId/appeal',
      path: `/v1/visibility/reports/${SUPPORTEE_PERSON_ID}/appeal`,
      init: postJson({ reason: 'x'.repeat(501) }),
      service: findAcceptedContractForSupportee,
    },
  ] as const)(
    '$name returns 400 for invalid JSON body before service work',
    async ({ path, init, service }) => {
      const res = await makeApp({
        profileId: PROFILE_ID,
        callerPersonId: SUPPORTER_PERSON_ID,
      }).request(path, init);

      expect(res.status).toBe(400);
      expect(service).not.toHaveBeenCalled();
      expectNoVisibilityServiceCalls();
    },
  );

  it.each(validRouteCases())(
    '$name returns an explicit 400 when no profile context is resolved',
    async ({ path, init }) => {
      const res = await makeApp({
        callerPersonId: SUPPORTER_PERSON_ID,
      }).request(path, init);

      expect(res.status).toBe(400);
      expectNoVisibilityServiceCalls();
    },
  );

  it.each(validRouteCases())(
    '$name returns an explicit 400 when no caller person context is resolved',
    async ({ path, init }) => {
      const res = await makeApp({
        profileId: PROFILE_ID,
      }).request(path, init);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Identity v2 caller person is required.',
      });
      expectNoVisibilityServiceCalls();
    },
  );

  it('POST /visibility/links returns 403 before service work when caller is not the supporter', async () => {
    const res = await makeApp({
      profileId: PROFILE_ID,
      callerPersonId: SUPPORTEE_PERSON_ID,
    }).request('/v1/visibility/links', postJson(makeInitiateBody()));

    expect(res.status).toBe(403);
    expect(initiateLink).not.toHaveBeenCalled();
    expectNoVisibilityServiceCalls();
  });

  it('POST /visibility/links/:id/accept returns 403 before service work when caller is not the actor', async () => {
    const res = await makeApp({
      profileId: PROFILE_ID,
      callerPersonId: SUPPORTEE_PERSON_ID,
    }).request(
      `/v1/visibility/links/${CONTRACT_ID}/accept`,
      postJson(makeAcceptBody()),
    );

    expect(res.status).toBe(403);
    expect(acceptLink).not.toHaveBeenCalled();
    expectNoVisibilityServiceCalls();
  });
});
