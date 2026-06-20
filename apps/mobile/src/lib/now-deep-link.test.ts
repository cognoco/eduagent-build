import type { NowDeepLink } from '@eduagent/schemas';

import { pushNowDeepLink } from './now-deep-link';

const subjectTopicLink: NowDeepLink = {
  route: 'subject.topic',
  params: {
    subjectId: 'subject-1',
    bookId: 'book-1',
    topicId: 'topic-1',
  },
  chain: ['subject.hub'],
};

describe('pushNowDeepLink', () => {
  it('pushes ancestor chain entries before the leaf route', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, subjectTopicLink, {
      subjectHubTarget: 'v2-subject-hub',
    });

    expect(router.push).toHaveBeenNthCalledWith(
      1,
      '/(app)/subject-hub/subject-1',
    );
    expect(router.push).toHaveBeenNthCalledWith(2, '/(app)/topic/topic-1');
  });

  it('supports the legacy shelf subject hub target until S2 owns the route', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, subjectTopicLink, {
      subjectHubTarget: 'legacy-shelf',
    });

    expect(router.push).toHaveBeenNthCalledWith(1, '/(app)/shelf/subject-1');
    expect(router.push).toHaveBeenNthCalledWith(2, '/(app)/topic/topic-1');
  });

  it('pushes a session resume route once when the chain is empty', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, {
      route: 'session.resume',
      params: { sessionId: 'session-1' },
      chain: [],
    });

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      '/(app)/session?sessionId=session-1',
    );
  });

  it('maps retention and challenge catalog keys to the existing topic leaf', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, {
      route: 'challenge.start',
      params: { subjectId: 'subject-1', topicId: 'topic-1' },
      chain: [],
    });

    expect(router.push).toHaveBeenCalledWith('/(app)/topic/topic-1');
  });

  it('pushes profile-level journal ledger moments without route params', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, {
      route: 'journal',
      params: {},
      chain: [],
    });

    expect(router.push).toHaveBeenCalledWith('/(app)/journal');
  });

  it('throws before indexing a missing or unknown chain key', () => {
    const router = { push: jest.fn() };

    expect(() =>
      pushNowDeepLink(router, {
        ...subjectTopicLink,
        chain: ['unknown.route'],
      }),
    ).toThrow(/unsupported route/i);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('throws when a required route parameter is missing', () => {
    const router = { push: jest.fn() };

    expect(() =>
      pushNowDeepLink(router, {
        route: 'subject.topic',
        params: { subjectId: 'subject-1' },
        chain: [],
      }),
    ).toThrow(/topicId/);
    expect(router.push).not.toHaveBeenCalled();
  });
});
