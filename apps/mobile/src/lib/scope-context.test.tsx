import { act, renderHook, waitFor } from '@testing-library/react-native';
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
});
