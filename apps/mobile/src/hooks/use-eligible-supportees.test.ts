import { renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import type { ScopeDescriptor, SupporterScopeList } from '@eduagent/schemas';

import { ProfileContext, type Profile } from '../lib/profile';
import { ScopeContextProvider } from '../lib/scope-context';
import { createTestProfile } from '../test-utils/app-hook-test-utils';
import { useEligibleManagedPersons } from './use-eligible-supportees';

const OWNER: Profile = createTestProfile({
  id: 'owner-1',
  accountId: 'account-1',
  displayName: 'Parent',
  isOwner: true,
});

const CHILD_A: Profile = createTestProfile({
  id: 'child-a',
  accountId: 'account-1',
  displayName: 'Emma',
  isOwner: false,
});

const CHILD_B: Profile = createTestProfile({
  id: 'child-b',
  accountId: 'account-1',
  displayName: 'Noah',
  isOwner: false,
});

function personScope(
  personId: string,
  displayName: string,
  edgeId: string,
): Extract<ScopeDescriptor, { kind: 'person' }> {
  return { kind: 'person', personId, edgeId, displayName };
}

// Exercise the REAL implementations — no internal mock. ProfileContext.Provider
// drives useLinkedChildren; the real ScopeContextProvider seeded via
// initialScopeList drives useScopeContext (mirrors scope-context.test.tsx's
// initialScopeList wiring).
function makeWrapper(scopeList: SupporterScopeList) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      ProfileContext.Provider,
      {
        value: {
          profiles: [OWNER, CHILD_A, CHILD_B],
          activeProfile: OWNER,
          isExplicitProxyMode: false,
          switchProfile: jest.fn(),
          isLoading: false,
          profileLoadError: null,
          profileWasRemoved: false,
          acknowledgeProfileRemoval: jest.fn(),
        },
      },
      createElement(ScopeContextProvider, {
        initialScopeList: scopeList,
        children,
      }),
    );
  };
}

describe('useEligibleManagedPersons', () => {
  it('returns every linked child when none has an existing scope/contract', () => {
    const { result } = renderHook(() => useEligibleManagedPersons(), {
      wrapper: makeWrapper({ shape: 'learner' }),
    });

    expect(result.current).toEqual([
      { id: 'child-a', displayName: 'Emma' },
      { id: 'child-b', displayName: 'Noah' },
    ]);
  });

  it('excludes a linked child that already has an active supportership scope', () => {
    const { result } = renderHook(() => useEligibleManagedPersons(), {
      wrapper: makeWrapper({
        shape: 'supporter',
        scopes: [
          { kind: 'supporter-hub' },
          personScope('child-a', 'Emma', 'edge-1'),
        ],
        defaultScopeIndex: 0,
      }),
    });

    expect(result.current).toEqual([{ id: 'child-b', displayName: 'Noah' }]);
  });

  it('returns an empty list when every linked child already has a scope', () => {
    const { result } = renderHook(() => useEligibleManagedPersons(), {
      wrapper: makeWrapper({
        shape: 'supporter',
        scopes: [
          { kind: 'supporter-hub' },
          personScope('child-a', 'Emma', 'edge-1'),
          personScope('child-b', 'Noah', 'edge-2'),
        ],
        defaultScopeIndex: 0,
      }),
    });

    expect(result.current).toEqual([]);
  });
});
