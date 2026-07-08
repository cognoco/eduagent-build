import { Hono } from 'hono';
import type { Database } from '@eduagent/database';

import { nowRoutes } from './now';
import { buildNowFeed, buildNowOverflow } from '../services/now-feed';
import { TEST_PROFILE_ID } from '@eduagent/test-utils';

jest.mock('../services/now-feed', () => ({
  ...jest.requireActual('../services/now-feed'),
  buildNowFeed: jest.fn(),
  buildNowOverflow: jest.fn(),
}));

const PROFILE_ID = TEST_PROFILE_ID;
const CHILD_ID = '00000000-0000-4000-8000-000000000101';

function makeApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, { marker: 'db' } as unknown as Database);
    c.set('profileId' as never, PROFILE_ID);
    await next();
  });
  app.route('/v1', nowRoutes);
  return app;
}

describe('now routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(buildNowFeed).mockResolvedValue({
      scope: 'self',
      cards: [],
      overflowCount: 0,
      generatedAt: '2026-06-20T00:00:00.000Z',
    });
    jest.mocked(buildNowOverflow).mockResolvedValue({
      scope: 'self',
      items: [],
    });
  });

  it('returns 400 when person scope omits personId', async () => {
    const res = await makeApp().request('/v1/now?scope=person');

    expect(res.status).toBe(400);
    expect(buildNowFeed).not.toHaveBeenCalled();
  });

  it('passes personId through to buildNowFeed for person scope', async () => {
    jest.mocked(buildNowFeed).mockResolvedValue({
      scope: 'person',
      cards: [],
      overflowCount: 0,
      generatedAt: '2026-06-20T00:00:00.000Z',
    });

    const res = await makeApp().request(
      `/v1/now?scope=person&personId=${CHILD_ID}`,
    );

    expect(res.status).toBe(200);
    expect(buildNowFeed).toHaveBeenCalledWith(expect.anything(), PROFILE_ID, {
      scope: 'person',
      personId: CHILD_ID,
    });
  });

  it('passes supporter-hub scope through without personId', async () => {
    jest.mocked(buildNowFeed).mockResolvedValue({
      scope: 'supporter-hub',
      cards: [],
      overflowCount: 0,
      generatedAt: '2026-06-20T00:00:00.000Z',
    });

    const res = await makeApp().request('/v1/now?scope=supporter-hub');

    expect(res.status).toBe(200);
    expect(buildNowFeed).toHaveBeenCalledWith(expect.anything(), PROFILE_ID, {
      scope: 'supporter-hub',
    });
  });

  it('returns 400 from overflow when person scope omits personId', async () => {
    const res = await makeApp().request('/v1/now/overflow?scope=person');

    expect(res.status).toBe(400);
    expect(buildNowOverflow).not.toHaveBeenCalled();
  });

  it('passes personId through to buildNowOverflow and returns parsed overflow items', async () => {
    jest.mocked(buildNowOverflow).mockResolvedValue({
      scope: 'person',
      items: [
        {
          kind: 'needs_deepening',
          templateKey: 'now.needs_deepening.default',
          params: {
            topicId: CHILD_ID,
          },
          deepLink: {
            route: 'subject.topic',
            params: {
              subjectId: CHILD_ID,
              bookId: CHILD_ID,
              topicId: CHILD_ID,
            },
            chain: ['library', 'subject', 'topic'],
          },
          scope: 'person',
          personId: CHILD_ID,
        },
      ],
    });

    const res = await makeApp().request(
      `/v1/now/overflow?scope=person&personId=${CHILD_ID}`,
    );

    expect(res.status).toBe(200);
    expect(buildNowOverflow).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      {
        scope: 'person',
        personId: CHILD_ID,
      },
    );
    await expect(res.json()).resolves.toMatchObject({
      scope: 'person',
      items: [
        {
          kind: 'needs_deepening',
          scope: 'person',
          personId: CHILD_ID,
        },
      ],
    });
  });

  it('passes supporter-hub scope through to buildNowOverflow without personId', async () => {
    jest.mocked(buildNowOverflow).mockResolvedValue({
      scope: 'supporter-hub',
      items: [],
    });

    const res = await makeApp().request('/v1/now/overflow?scope=supporter-hub');

    expect(res.status).toBe(200);
    expect(buildNowOverflow).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      {
        scope: 'supporter-hub',
      },
    );
  });
});
