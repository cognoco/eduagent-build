// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../services/parking-lot-data' /* gc1-allow: pattern-a conversion */,
  () => ({
    ...jest.requireActual('../services/parking-lot-data'),
    getParkingLotItems: jest.fn(),
    getParkingLotItemsForTopic: jest.fn(),
    addParkingLotItem: jest.fn(),
    MAX_ITEMS_PER_TOPIC: 10,
  }),
);

jest.mock('../services/session' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/session'),
  getSession: jest.fn(),
}));

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

function createApp(profileId: string | typeof NO_PROFILE = 'test-profile-id') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, {});
    if (profileId !== NO_PROFILE) {
      c.set('profileId' as never, profileId);
    }
    c.set('user' as never, { id: 'test-user' });
    await next();
  });
  app.route('/', parkingLotRoutes);
  return app;
}

beforeEach(() => jest.clearAllMocks());

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
});
