import { renderHook } from '@testing-library/react-native';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import type { Profile } from '../lib/profile';

import {
  useActiveProfileRole,
  useActiveProfileRoleState,
} from './use-active-profile-role';
import { useParentProxy } from './use-parent-proxy';

// Canonical pattern-A (requireActual + targeted override): most tests use the
// real useParentProxy driven via ProfileContext. One defensive test requires an
// impossible flag combination (isOwner=true AND isParentProxy=true) that the
// real hook cannot produce — that case overrides useParentProxy via the spy
// below. All other exports from the module remain real.
jest.mock('./use-parent-proxy', () => ({
  // gc1-allow: defensive impossible-state test; useParentProxy cannot produce isOwner=true && isParentProxy=true from real profiles
  ...jest.requireActual('./use-parent-proxy'),
  useParentProxy: jest.fn(),
}));

const mockUseParentProxy = useParentProxy as jest.MockedFunction<
  typeof useParentProxy
>;

// Helper: build a wrapper where activeProfile is an owner with no child profiles
// → isParentProxy = false, role = 'owner'.
function ownerWrapper() {
  const owner = createTestProfile({ id: 'owner-1', isOwner: true });
  return createHookWrapper({ activeProfile: owner, profiles: [owner] }).wrapper;
}

// Helper: build a wrapper where activeProfile is a non-owner with no parent in list
// → isParentProxy = false, role = 'child'.
function childDirectWrapper() {
  const child = createTestProfile({ id: 'child-1', isOwner: false });
  return createHookWrapper({ activeProfile: child, profiles: [child] }).wrapper;
}

// Helper: build a wrapper where activeProfile is a non-owner AND explicit proxy is set
// → isParentProxy = true (via isExplicitProxyMode), role = 'impersonated-child'.
// [ACCOUNT-04] Must set isExplicitProxyMode:true — real useParentProxy no longer
// derives proxy from profile shape. Only explicit switchProfile(id, {proxyMode:true})
// triggers proxy; plain profile switches never set it.
function proxyWrapper() {
  const owner = createTestProfile({ id: 'owner-1', isOwner: true });
  const child = createTestProfile({ id: 'child-1', isOwner: false });
  return createHookWrapper({
    activeProfile: child,
    profiles: [owner, child],
    isExplicitProxyMode: true,
  }).wrapper;
}

// Helper: null-profile wrapper (no active profile).
function noProfileWrapper() {
  return createHookWrapper({ activeProfile: null, profiles: [] }).wrapper;
}

beforeEach(() => {
  // Default: delegate to real hook implementation (real ProfileContext drives result).
  mockUseParentProxy.mockImplementation(
    jest.requireActual<typeof import('./use-parent-proxy')>(
      './use-parent-proxy',
    ).useParentProxy,
  );
});

describe('useActiveProfileRole', () => {
  it('returns null when no active profile', () => {
    const { result } = renderHook(() => useActiveProfileRole(), {
      wrapper: noProfileWrapper(),
    });
    expect(result.current).toBeNull();
  });

  it('returns "owner" for an account owner not in proxy', () => {
    const { result } = renderHook(() => useActiveProfileRole(), {
      wrapper: ownerWrapper(),
    });
    expect(result.current).toBe('owner');
  });

  it('returns "child" for a non-owner not in proxy (child user signed in directly)', () => {
    const { result } = renderHook(() => useActiveProfileRole(), {
      wrapper: childDirectWrapper(),
    });
    expect(result.current).toBe('child');
  });

  it('returns "impersonated-child" when proxy mode is active', () => {
    const { result } = renderHook(() => useActiveProfileRole(), {
      wrapper: proxyWrapper(),
    });
    expect(result.current).toBe('impersonated-child');
  });

  // Defensive: even if a future bug ever flips an owner profile into proxy
  // mode, we want to hide destructive actions rather than expose them. So
  // proxy precedence must beat isOwner.
  it('prefers "impersonated-child" over "owner" if both flags somehow set', () => {
    // This state (isOwner=true AND isParentProxy=true) is impossible from the
    // real useParentProxy hook (isParentProxy requires !isOwner). We override
    // the mock to simulate the defensive guard inside useActiveProfileRoleState.
    const owner = createTestProfile({ id: 'owner-1', isOwner: true });
    const defensiveWrapper = createHookWrapper({
      activeProfile: owner,
      profiles: [owner],
    }).wrapper;
    mockUseParentProxy.mockReturnValue({
      isParentProxy: true,
      childProfile: null,
      parentProfile: null,
    });

    const { result } = renderHook(() => useActiveProfileRole(), {
      wrapper: defensiveWrapper,
    });
    expect(result.current).toBe('impersonated-child');
  });
});

// ---------------------------------------------------------------------------
// [BUG-130] useActiveProfileRoleState — distinguishes loading vs missing so
// role-gated UI doesn't flash the wrong state during initial profile load.
// ---------------------------------------------------------------------------
describe('useActiveProfileRoleState [BUG-130]', () => {
  it('[BREAK] returns isLoading=true when profile query is still resolving', () => {
    // createHookWrapper always sets isLoading: false; we need isLoading: true.
    // Build the wrapper value manually using the ProfileContext directly.
    const { ProfileContext } =
      require('../lib/profile') as typeof import('../lib/profile');
    const { createElement } = require('react') as typeof import('react');
    const { QueryClient, QueryClientProvider } =
      require('@tanstack/react-query') as typeof import('@tanstack/react-query');

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const ctxValue = {
      profiles: [] as Profile[],
      activeProfile: null,
      isExplicitProxyMode: false,
      switchProfile: async () => ({ success: true }),
      isLoading: true,
      profileLoadError: null,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: () => undefined,
    };

    function LoadingWrapper({ children }: { children: React.ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: qc },
        createElement(ProfileContext.Provider, { value: ctxValue }, children),
      );
    }

    const { result } = renderHook(() => useActiveProfileRoleState(), {
      wrapper: LoadingWrapper,
    });
    expect(result.current).toEqual({ role: null, isLoading: true });
  });

  it('[BREAK] returns isLoading=false when profile query resolved with no profile', () => {
    const { result } = renderHook(() => useActiveProfileRoleState(), {
      wrapper: noProfileWrapper(),
    });
    expect(result.current).toEqual({ role: null, isLoading: false });
  });

  it('returns role with isLoading=false once an owner profile loads', () => {
    const { result } = renderHook(() => useActiveProfileRoleState(), {
      wrapper: ownerWrapper(),
    });
    expect(result.current).toEqual({ role: 'owner', isLoading: false });
  });

  it('returns role with isLoading=false once a child profile loads', () => {
    const { result } = renderHook(() => useActiveProfileRoleState(), {
      wrapper: childDirectWrapper(),
    });
    expect(result.current).toEqual({ role: 'child', isLoading: false });
  });

  it('returns impersonated-child role with isLoading=false when proxy is active', () => {
    const { result } = renderHook(() => useActiveProfileRoleState(), {
      wrapper: proxyWrapper(),
    });
    expect(result.current).toEqual({
      role: 'impersonated-child',
      isLoading: false,
    });
  });

  it('thin wrapper useActiveProfileRole stays compatible with role-only callers', () => {
    const { result } = renderHook(() => useActiveProfileRole(), {
      wrapper: ownerWrapper(),
    });
    expect(result.current).toBe('owner');
  });
});
