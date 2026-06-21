jest.mock(
  '../services/parking-lot-data' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/parking-lot-data',
    ) as typeof import('../services/parking-lot-data');
    return {
      ...actual,
      getParkingLotItems: jest.fn(),
      getParkingLotItemsForTopic: jest.fn(),
      addParkingLotItem: jest.fn(),
      MAX_ITEMS_PER_TOPIC: 10,
    };
  },
);

jest.mock('../services/session' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/session',
  ) as typeof import('../services/session');
  return {
    ...actual,
    getSession: jest.fn(),
  };
});

import { Hono } from 'hono';
import { parkingLotRoutes } from './parking-lot';
import {
  getParkingLotItems,
  getParkingLotItemsForTopic,
  addParkingLotItem,
} from '../services/parking-lot-data';
import { getSession } from '../services/session';

const mockGetParkingLotItems = getParkingLotItems as jest.MockedFunction<
  typeof getParkingLotItems
>;
const mockGetParkingLotItemsForTopic =
  getParkingLotItemsForTopic as jest.MockedFunction<
    typeof getParkingLotItemsForTopic
  >;
const mockAddParkingLotItem = addParkingLotItem as jest.MockedFunction<
  typeof addParkingLotItem
>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

const TEST_SESSION_ID = 'a0000000-0000-4000-a000-000000000101';
const TEST_TOPIC_ID = 'a0000000-0000-4000-a000-000000000301';
const TEST_SUBJECT_ID = 'a0000000-0000-4000-a000-000000000201';
const TEST_ITEM_ID = 'a0000000-0000-4000-a000-000000000501';

const MOCK_ITEM = {
  id: TEST_ITEM_ID,
  question: 'What is quantum entanglement?',
  explored: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const NO_PROFILE = Symbol('no-profile');

function createApp(
  profileId: string | typeof NO_PROFILE = 'test-profile-id',
  opts?: { isOwner?: boolean },
) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, {});
    if (profileId !== NO_PROFILE) {
      c.set('profileId' as never, profileId);
    }
    c.set('user' as never, { id: 'test-user' });
    // [WI-161 / DS-072] Mirror profileScopeMiddleware: set profileMeta so the
    // server-derived proxy-mode guard can read isOwner. Default to owner so the
    // pre-existing assertions still pass; tests that exercise the guard opt in
    // with `{ isOwner: false }`.
    const isOwner = opts?.isOwner ?? true;
    c.set('profileMeta' as never, {
      isOwner,
      resolvedVia: isOwner ? 'explicit-header' : 'auto',
    });
    await next();
  });
  app.route('/', parkingLotRoutes);
  return app;
}

beforeEach(() => jest.clearAllMocks());

// [BUG-392] UUID validation guard tests — non-UUID path params must be rejected
// with 400 before reaching the DB layer. This prevents Postgres errors (5xx)
// and cross-account confusion if the DB layer assumed a scoped repo handles it.
describe('UUID param validation [BUG-392]', () => {
  it('GET /sessions/:sessionId/parking-lot returns 400 for non-UUID sessionId', async () => {
    const app = createApp();
    const res = await app.request('/sessions/not-a-uuid/parking-lot');
    expect(res.status).toBe(400);
    expect(mockGetParkingLotItems).not.toHaveBeenCalled();
  });

  it('GET /subjects/:subjectId/topics/:topicId/parking-lot returns 400 for non-UUID topicId', async () => {
    const app = createApp();
    const res = await app.request(
      `/subjects/${TEST_SUBJECT_ID}/topics/not-a-uuid/parking-lot`,
    );
    expect(res.status).toBe(400);
    expect(mockGetParkingLotItemsForTopic).not.toHaveBeenCalled();
  });

  it('GET /subjects/:subjectId/topics/:topicId/parking-lot returns 400 for non-UUID subjectId', async () => {
    const app = createApp();
    const res = await app.request(
      `/subjects/not-a-uuid/topics/${TEST_TOPIC_ID}/parking-lot`,
    );
    expect(res.status).toBe(400);
    expect(mockGetParkingLotItemsForTopic).not.toHaveBeenCalled();
  });

  it('POST /sessions/:sessionId/parking-lot returns 400 for non-UUID sessionId', async () => {
    const app = createApp();
    const res = await app.request('/sessions/not-a-uuid/parking-lot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is quantum entanglement?' }),
    });
    expect(res.status).toBe(400);
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});

describe('GET /sessions/:sessionId/parking-lot', () => {
  it('returns 200 with items and count', async () => {
    mockGetParkingLotItems.mockResolvedValueOnce({
      items: [MOCK_ITEM],
      count: 1,
    });
    const app = createApp();

    const res = await app.request(`/sessions/${TEST_SESSION_ID}/parking-lot`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [MOCK_ITEM], count: 1 });
    expect(mockGetParkingLotItems).toHaveBeenCalledWith(
      {},
      'test-profile-id',
      TEST_SESSION_ID,
    );
  });

  it('returns 400 when profileId is missing', async () => {
    const app = createApp(NO_PROFILE);

    const res = await app.request(`/sessions/${TEST_SESSION_ID}/parking-lot`);

    expect(res.status).toBe(400);
    expect(mockGetParkingLotItems).not.toHaveBeenCalled();
  });

  it('returns empty items when session has no parked questions', async () => {
    mockGetParkingLotItems.mockResolvedValueOnce({ items: [], count: 0 });
    const app = createApp();

    const res = await app.request(`/sessions/${TEST_SESSION_ID}/parking-lot`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [], count: 0 });
  });
});

describe('GET /subjects/:subjectId/topics/:topicId/parking-lot', () => {
  it('returns 200 with items and count', async () => {
    mockGetParkingLotItemsForTopic.mockResolvedValueOnce({
      items: [MOCK_ITEM],
      count: 1,
    });
    const app = createApp();

    const res = await app.request(
      `/subjects/${TEST_SUBJECT_ID}/topics/${TEST_TOPIC_ID}/parking-lot`,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [MOCK_ITEM], count: 1 });
    expect(mockGetParkingLotItemsForTopic).toHaveBeenCalledWith(
      {},
      'test-profile-id',
      TEST_TOPIC_ID,
    );
  });

  it('returns 400 when profileId is missing', async () => {
    const app = createApp(NO_PROFILE);

    const res = await app.request(
      `/subjects/${TEST_SUBJECT_ID}/topics/${TEST_TOPIC_ID}/parking-lot`,
    );

    expect(res.status).toBe(400);
    expect(mockGetParkingLotItemsForTopic).not.toHaveBeenCalled();
  });
});

describe('POST /sessions/:sessionId/parking-lot', () => {
  it('returns 201 with the created item', async () => {
    mockGetSession.mockResolvedValueOnce({
      id: TEST_SESSION_ID,
      topicId: TEST_TOPIC_ID,
    } as never);
    mockAddParkingLotItem.mockResolvedValueOnce(MOCK_ITEM);
    const app = createApp();

    const res = await app.request(`/sessions/${TEST_SESSION_ID}/parking-lot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is quantum entanglement?' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ item: MOCK_ITEM });
  });

  it('returns 404 when session is not found', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const app = createApp();

    const res = await app.request(`/sessions/${TEST_SESSION_ID}/parking-lot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is quantum entanglement?' }),
    });

    expect(res.status).toBe(404);
    expect(mockAddParkingLotItem).not.toHaveBeenCalled();
  });

  it('returns 409 when parking lot is full', async () => {
    mockGetSession.mockResolvedValueOnce({
      id: TEST_SESSION_ID,
      topicId: TEST_TOPIC_ID,
    } as never);
    mockAddParkingLotItem.mockResolvedValueOnce(null);
    const app = createApp();

    const res = await app.request(`/sessions/${TEST_SESSION_ID}/parking-lot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is quantum entanglement?' }),
    });

    expect(res.status).toBe(409);
  });

  it('returns 400 when question is empty', async () => {
    const app = createApp();

    const res = await app.request(`/sessions/${TEST_SESSION_ID}/parking-lot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '' }),
    });

    expect(res.status).toBe(400);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('returns 400 when profileId is missing', async () => {
    const app = createApp(NO_PROFILE);

    const res = await app.request(`/sessions/${TEST_SESSION_ID}/parking-lot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is quantum entanglement?' }),
    });

    expect(res.status).toBe(400);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  // [WI-161 / DS-072] Proxy-mode child profile can add parking-lot items.
  // Before this fix, a non-owner profile (parent acting on behalf of a child)
  // could POST to the parking-lot endpoint and write items into the child's
  // queue — exactly the proxy-mode write-bypass class the canonical guard
  // assertNotProxyMode is meant to close. Mirrors the pattern proven in
  // assessments.test.ts and proxy-guard.test.ts.
  it('[WI-161 / DS-072] returns 403 when caller is in proxy mode (isOwner=false)', async () => {
    const app = createApp('test-profile-id', { isOwner: false });

    const res = await app.request(`/sessions/${TEST_SESSION_ID}/parking-lot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is quantum entanglement?' }),
    });

    expect(res.status).toBe(403);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockAddParkingLotItem).not.toHaveBeenCalled();
  });
});
