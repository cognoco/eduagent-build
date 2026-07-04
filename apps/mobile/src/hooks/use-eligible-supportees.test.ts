import { renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import type { ScopeDescriptor } from '@eduagent/schemas';

import { ProfileContext, type Profile } from '../lib/profile';
import { createTestProfile } from '../test-utils/app-hook-test-utils';
import { useEligibleManagedPersons } from './use-eligible-supportees';

let mockAvailableScopes: ScopeDescriptor[] = [];

jest.mock(
  // gc1-allow: unit test isolates the eligibility computation from the scope provider's fetch/persistence plumbing, which is covered separately in scope-context.test.tsx
  '../lib/scope-context',
  () => ({
    useScopeContext: () => ({ availableScopes: mockAvailableScopes }),
  }),
);

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

function wrapper({ children }: { children: ReactNode }): React.ReactElement {
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
    children,
  );
}

describe('useEligibleManagedPersons', () => {
  beforeEach(() => {
    mockAvailableScopes = [];
  });

  it('returns every linked child when none has an existing scope/contract', () => {
    const { result } = renderHook(() => useEligibleManagedPersons(), {
      wrapper,
    });

    expect(result.current).toEqual([
      { id: 'child-a', displayName: 'Emma' },
      { id: 'child-b', displayName: 'Noah' },
    ]);
  });

  it('excludes a linked child that already has an active supportership scope', () => {
    mockAvailableScopes = [
      { kind: 'supporter-hub' },
      {
        kind: 'person',
        personId: 'child-a',
        edgeId: 'edge-1',
        displayName: 'Emma',
      },
    ];

    const { result } = renderHook(() => useEligibleManagedPersons(), {
      wrapper,
    });

    expect(result.current).toEqual([{ id: 'child-b', displayName: 'Noah' }]);
  });

  it('returns an empty list when every linked child already has a scope', () => {
    mockAvailableScopes = [
      { kind: 'supporter-hub' },
      {
        kind: 'person',
        personId: 'child-a',
        edgeId: 'edge-1',
        displayName: 'Emma',
      },
      {
        kind: 'person',
        personId: 'child-b',
        edgeId: 'edge-2',
        displayName: 'Noah',
      },
    ];

    const { result } = renderHook(() => useEligibleManagedPersons(), {
      wrapper,
    });

    expect(result.current).toEqual([]);
  });
});
