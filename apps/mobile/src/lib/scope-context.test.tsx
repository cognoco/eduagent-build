import {
  act,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { SupporterScopeList } from '@eduagent/schemas';

import * as SecureStore from './secure-storage';
import {
  getLastActiveScopeStorageKey,
  ScopeContextProvider,
  useScopeContext,
} from './scope-context';

const personScope = {
  kind: 'person' as const,
  personId: '00000000-0000-4000-8000-000000000101',
  edgeId: '00000000-0000-4000-8000-000000000201',
  displayName: 'Emma',
};

function wrapperFor(scopeList: SupporterScopeList, profileId?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ScopeContextProvider
        initialScopeList={scopeList}
        initialProfileId={profileId}
      >
        {children}
      </ScopeContextProvider>
    );
  };
}

describe('ScopeContextProvider', () => {
  it('synthesizes implicit Me for learner shape without exposing chip scopes', () => {
    const { result } = renderHook(() => useScopeContext(), {
      wrapper: wrapperFor({ shape: 'learner' }),
    });

    expect(result.current.scopeList).toEqual({ shape: 'learner' });
    expect(result.current.availableScopes).toEqual([]);
    expect(result.current.activeScope).toEqual({ kind: 'me' });
  });

  it('uses the supporter defaultScopeIndex when no user-set scope exists', () => {
    const { result } = renderHook(() => useScopeContext(), {
      wrapper: wrapperFor({
        shape: 'supporter',
        scopes: [{ kind: 'supporter-hub' }, personScope, { kind: 'me' }],
        defaultScopeIndex: 1,
      }),
    });

    expect(result.current.activeScope).toEqual(personScope);
  });

  it('lets the user switch active scope by descriptor', () => {
    const { result } = renderHook(() => useScopeContext(), {
      wrapper: wrapperFor({
        shape: 'supporter',
        scopes: [{ kind: 'supporter-hub' }, personScope, { kind: 'me' }],
        defaultScopeIndex: 0,
      }),
    });

    act(() => result.current.setActiveScope(personScope));

    expect(result.current.activeScope).toEqual(personScope);
  });

  it('lets a first-time supporter switch into Me even though the server has not resolved it as a known scope yet', () => {
    const { result } = renderHook(() => useScopeContext(), {
      wrapper: wrapperFor({
        shape: 'supporter',
        scopes: [{ kind: 'supporter-hub' }, personScope],
        defaultScopeIndex: 0,
      }),
    });

    act(() => result.current.setActiveScope({ kind: 'me' }));

    expect(result.current.activeScope).toEqual({ kind: 'me' });
  });

  it('still ignores an unknown person scope (unlike Me, it requires a live supportership edge)', () => {
    const { result } = renderHook(() => useScopeContext(), {
      wrapper: wrapperFor({
        shape: 'supporter',
        scopes: [{ kind: 'supporter-hub' }, personScope],
        defaultScopeIndex: 0,
      }),
    });

    act(() =>
      result.current.setActiveScope({
        kind: 'person',
        personId: 'unknown-person',
        edgeId: 'unknown-edge',
        displayName: 'Ghost',
      }),
    );

    expect(result.current.activeScope).toEqual({ kind: 'supporter-hub' });
  });

  it('prefers persisted last-active scope over the server default hint', async () => {
    const profileId = '00000000-0000-4000-8000-000000000901';
    await SecureStore.setItemAsync(
      getLastActiveScopeStorageKey(profileId),
      `person:${personScope.personId}:${personScope.edgeId}`,
    );

    const { result } = renderHook(() => useScopeContext(), {
      wrapper: wrapperFor(
        {
          shape: 'supporter',
          scopes: [{ kind: 'supporter-hub' }, personScope, { kind: 'me' }],
          defaultScopeIndex: 0,
        },
        profileId,
      ),
    });

    await waitFor(() => {
      expect(result.current.activeScope).toEqual(personScope);
    });
  });

  it('warns when the active scope cannot be persisted', async () => {
    const persistenceError = new Error('synthetic persistence failure');
    const setItemSpy = jest
      .spyOn(SecureStore, 'setItemAsync')
      .mockRejectedValueOnce(persistenceError);
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      const { result } = renderHook(() => useScopeContext(), {
        wrapper: wrapperFor(
          {
            shape: 'supporter',
            scopes: [{ kind: 'supporter-hub' }, personScope, { kind: 'me' }],
            defaultScopeIndex: 0,
          },
          '00000000-0000-4000-8000-000000000903',
        ),
      });

      act(() => result.current.setActiveScope(personScope));

      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          '[scope-context] failed to persist active scope',
          persistenceError,
        );
      });
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  // [WI-2243] AC-3 — THE tricky correctness clause. A test that only checks
  // the settled state (Me selected, scopeList already lists Me) would pass
  // green while leaving the actual guarantee — no flash/fall-back to
  // person/default scope during the interval where the persisted selection
  // already says Me but GET /scopes doesn't list it yet — completely
  // untested. These two tests drive that transient window explicitly.
  describe('AC-3 no-flash convergence window', () => {
    it('stays on Me through the interval between a live tap and the server scope list catching up', () => {
      const captured: { value?: ReturnType<typeof useScopeContext> } = {};
      function Probe() {
        captured.value = useScopeContext();
        return null;
      }

      const scopeListNoMe: SupporterScopeList = {
        shape: 'supporter',
        scopes: [{ kind: 'supporter-hub' }, personScope],
        defaultScopeIndex: 0,
      };

      const { rerender } = render(
        <ScopeContextProvider initialScopeList={scopeListNoMe}>
          <Probe />
        </ScopeContextProvider>,
      );

      // Simulates SupporterSelfLearningDoorway's tap handler: switch to Me
      // before the server has any real learning state to report.
      act(() => captured.value!.setActiveScope({ kind: 'me' }));
      expect(captured.value!.activeScope).toEqual({ kind: 'me' });

      // The transient window: the persisted selection already says Me, but
      // GET /scopes still doesn't list it (first-time interval). Must NOT
      // fall back to the person or default scope.
      expect(captured.value!.activeScope).not.toEqual(personScope);
      expect(captured.value!.activeScope).not.toEqual({
        kind: 'supporter-hub',
      });

      // The server catches up (e.g. after the supporter's first subject
      // lands) and GET /scopes now lists Me — convergence, no flash.
      rerender(
        <ScopeContextProvider
          initialScopeList={{
            shape: 'supporter',
            scopes: [{ kind: 'supporter-hub' }, personScope, { kind: 'me' }],
            defaultScopeIndex: 0,
          }}
        >
          <Probe />
        </ScopeContextProvider>,
      );
      expect(captured.value!.activeScope).toEqual({ kind: 'me' });
    });

    it('after app restart, Me is restored from the persisted key and survives the interval before GET /scopes lists it', async () => {
      const profileId = '00000000-0000-4000-8000-000000000902';
      await SecureStore.setItemAsync(
        getLastActiveScopeStorageKey(profileId),
        'me',
      );

      const captured: { value?: ReturnType<typeof useScopeContext> } = {};
      function Probe() {
        captured.value = useScopeContext();
        return null;
      }

      const scopeListNoMe: SupporterScopeList = {
        shape: 'supporter',
        scopes: [{ kind: 'supporter-hub' }, personScope],
        defaultScopeIndex: 0,
      };

      const { rerender } = render(
        <ScopeContextProvider
          initialScopeList={scopeListNoMe}
          initialProfileId={profileId}
        >
          <Probe />
        </ScopeContextProvider>,
      );

      // Persisted key loads from SecureStore asynchronously; once it does,
      // Me is restored even though the server's scopeList still has no
      // 'me' entry — the transient window from a cold start.
      await waitFor(() => {
        expect(captured.value!.activeScope).toEqual({ kind: 'me' });
      });
      expect(captured.value!.activeScope).not.toEqual(personScope);
      expect(captured.value!.activeScope).not.toEqual({
        kind: 'supporter-hub',
      });

      // GET /scopes converges — still Me, no flash, no re-selection loop.
      rerender(
        <ScopeContextProvider
          initialScopeList={{
            shape: 'supporter',
            scopes: [{ kind: 'supporter-hub' }, personScope, { kind: 'me' }],
            defaultScopeIndex: 0,
          }}
          initialProfileId={profileId}
        >
          <Probe />
        </ScopeContextProvider>,
      );
      expect(captured.value!.activeScope).toEqual({ kind: 'me' });
    });
  });
});
