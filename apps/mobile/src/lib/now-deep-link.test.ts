import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import type { NowDeepLink, SupporterScopeList } from '@eduagent/schemas';
import { MENTOR_CAPABILITY_CASES } from '@eduagent/test-utils';

import { pushNowDeepLink } from './now-deep-link';
import { ScopeContextProvider, useScopeContext } from './scope-context';

// WI-2223: a support.hub pointer must select the Support-hub scope before the
// Mentor tab opens, from every source scope, and must not throw if the scope
// list has changed since the pointer was minted. Uses the real
// ScopeContextProvider (not a mock) so these assertions exercise setActiveScope's
// actual no-op/safety contract (scope-context.tsx), not a stand-in spy.
const personScope = {
  kind: 'person' as const,
  personId: '00000000-0000-4000-8000-000000000101',
  edgeId: '00000000-0000-4000-8000-000000000201',
  displayName: 'Emma',
};

function firstCallOrder(mockFn: jest.Mock): number {
  const order = mockFn.mock.invocationCallOrder[0];
  if (order === undefined) {
    throw new Error('expected mock to have been called');
  }
  return order;
}

function scopeWrapperFor(scopeList: SupporterScopeList) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(ScopeContextProvider, {
      initialScopeList: scopeList,
      children,
    });
  };
}

const subjectTopicLink: NowDeepLink = {
  route: 'subject.topic',
  params: {
    subjectId: 'subject-1',
    bookId: 'book-1',
    topicId: 'topic-1',
  },
  chain: ['subject.hub'],
};

const catalogJumpCase = MENTOR_CAPABILITY_CASES.find(
  ({ capability }) => capability === 'catalog-jump',
);

if (!catalogJumpCase) {
  throw new Error('Shared Mentor catalog-jump case is missing');
}

const catalogJumpMatcher = catalogJumpCase.expectedMatcher;
const catalogJumpRoute = catalogJumpCase.expectedRoute;

if (catalogJumpMatcher.kind !== 'jump' || catalogJumpRoute.kind !== 'path') {
  throw new Error('Shared Mentor catalog-jump case is incomplete');
}

describe('pushNowDeepLink', () => {
  it('expands the shared Mentor catalog jump through the closed route mapper', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(
      router,
      {
        route: catalogJumpMatcher.deepLink.route,
        params: { ...catalogJumpMatcher.deepLink.params },
        chain: [...catalogJumpMatcher.deepLink.chain],
      },
      { subjectHubTarget: 'v2-subject-hub' },
    );

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(catalogJumpRoute.href);
  });

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

  it('[WI-1121] pushes a session summary route once when the chain is empty', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, {
      route: 'session.summary',
      params: { sessionId: 'session-1' },
      chain: [],
    });

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/session-summary/session-1');
  });

  it('retention.review deep link produces topic path with mode=review', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, {
      route: 'retention.review',
      params: { subjectId: 'subject-1', topicId: 'topic-1' },
      chain: [],
    });

    expect(router.push).toHaveBeenCalledWith(
      '/(app)/topic/topic-1?mode=review',
    );
  });

  it('challenge.start deep link produces topic path with mode=challenge', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, {
      route: 'challenge.start',
      params: { subjectId: 'subject-1', topicId: 'topic-1' },
      chain: [],
    });

    expect(router.push).toHaveBeenCalledWith(
      '/(app)/topic/topic-1?mode=challenge',
    );
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

  it('pushes support hub pointers to the Mentor tab', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, {
      route: 'support.hub',
      params: {},
      chain: [],
    });

    expect(router.push).toHaveBeenCalledWith('/(app)/mentor');
  });

  // [WI-2223 AC-1] a support.hub pointer must select the Support-hub scope
  // before opening the Mentor tab, or the learner Mentor surface renders
  // instead (activeScope is otherwise unchanged by the push).
  it('[WI-2223] selects the Support-hub scope before pushing a support hub pointer', () => {
    const router = { push: jest.fn() };
    const setActiveScope = jest.fn();

    pushNowDeepLink(
      router,
      { route: 'support.hub', params: {}, chain: [] },
      { setActiveScope },
    );

    expect(setActiveScope).toHaveBeenCalledWith({ kind: 'supporter-hub' });
    expect(router.push).toHaveBeenCalledWith('/(app)/mentor');
    expect(firstCallOrder(setActiveScope)).toBeLessThan(
      firstCallOrder(router.push),
    );
  });

  it('[WI-2223] never calls setActiveScope for a non-support.hub route', () => {
    const router = { push: jest.fn() };
    const setActiveScope = jest.fn();

    pushNowDeepLink(
      router,
      { route: 'journal', params: {}, chain: [] },
      { setActiveScope },
    );

    expect(setActiveScope).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/(app)/journal');
  });

  it('pushes the full More -> Account -> Subscription manage-billing chain', () => {
    const router = { push: jest.fn() };

    pushNowDeepLink(router, {
      route: 'billing.manage',
      params: {},
      chain: ['settings.more', 'settings.account'],
    });

    expect(router.push).toHaveBeenNthCalledWith(1, '/(app)/more');
    expect(router.push).toHaveBeenNthCalledWith(2, '/(app)/more/account');
    expect(router.push).toHaveBeenNthCalledWith(3, '/(app)/subscription');
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

// [WI-2223] AC-2 + AC-4: wired against the real ScopeContextProvider (not a
// mock) so these exercise setActiveScope's actual contract — every source
// scope safely resolves to Support-hub, and a learner-shape/me-only account
// (setActiveScope early-returns per scope-context.tsx) is unaffected.
describe('pushNowDeepLink support.hub scope selection against real scope state', () => {
  it.each([
    [
      'Me scope',
      {
        shape: 'supporter' as const,
        scopes: [{ kind: 'supporter-hub' as const }, { kind: 'me' as const }],
        defaultScopeIndex: 1,
      },
    ],
    [
      'a person scope',
      {
        shape: 'supporter' as const,
        scopes: [{ kind: 'supporter-hub' as const }, personScope],
        defaultScopeIndex: 1,
      },
    ],
  ])(
    '[AC-2] selects the Support-hub scope from %s without throwing',
    (_label, scopeList) => {
      const { result } = renderHook(() => useScopeContext(), {
        wrapper: scopeWrapperFor(scopeList),
      });
      const router = { push: jest.fn() };

      expect(() => {
        act(() => {
          pushNowDeepLink(
            router,
            { route: 'support.hub', params: {}, chain: [] },
            { setActiveScope: result.current.setActiveScope },
          );
        });
      }).not.toThrow();

      expect(result.current.activeScope).toEqual({ kind: 'supporter-hub' });
      expect(router.push).toHaveBeenCalledWith('/(app)/mentor');
    },
  );

  it('[AC-2] stays safe when the active person scope predates the current scope list (stale edge)', () => {
    // Simulates a pointer minted while `personScope` was active, then the
    // supportership edge disappearing from the server's scope list before the
    // pointer is followed — the pointer never references personScope at all,
    // so this must resolve exactly like any other source scope.
    const { result } = renderHook(() => useScopeContext(), {
      wrapper: scopeWrapperFor({
        shape: 'supporter',
        scopes: [{ kind: 'supporter-hub' }, personScope],
        defaultScopeIndex: 1,
      }),
    });
    expect(result.current.activeScope).toEqual(personScope);
    const router = { push: jest.fn() };

    act(() => {
      pushNowDeepLink(
        router,
        { route: 'support.hub', params: {}, chain: [] },
        { setActiveScope: result.current.setActiveScope },
      );
    });

    expect(result.current.activeScope).toEqual({ kind: 'supporter-hub' });
  });

  it('[AC-4] leaves a learner-shape (me-only) account unaffected — setActiveScope early-returns, navigation still proceeds', () => {
    const { result } = renderHook(() => useScopeContext(), {
      wrapper: scopeWrapperFor({ shape: 'learner' }),
    });
    const router = { push: jest.fn() };

    act(() => {
      pushNowDeepLink(
        router,
        { route: 'support.hub', params: {}, chain: [] },
        { setActiveScope: result.current.setActiveScope },
      );
    });

    expect(result.current.activeScope).toEqual({ kind: 'me' });
    expect(router.push).toHaveBeenCalledWith('/(app)/mentor');
  });
});
