import { renderHook } from '@testing-library/react-native';

let mockActiveProfile: { isOwner: boolean } | null = null;
let mockIsParentProxy = false;
let mockIsLoading = false;

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: mockActiveProfile,
    isLoading: mockIsLoading,
  }),
}));

jest.mock('./use-parent-proxy', () => ({
  useParentProxy: () => ({ isParentProxy: mockIsParentProxy }),
}));

const {
  useActiveProfileRole,
  useActiveProfileRoleState,
} = require('./use-active-profile-role');

describe('useActiveProfileRole', () => {
  beforeEach(() => {
    mockActiveProfile = null;
    mockIsParentProxy = false;
    mockIsLoading = false;
  });

  it('returns null when no active profile', () => {
    const { result } = renderHook(() => useActiveProfileRole());
    expect(result.current).toBeNull();
  });

  it('returns "owner" for an account owner not in proxy', () => {
    mockActiveProfile = { isOwner: true };
    const { result } = renderHook(() => useActiveProfileRole());
    expect(result.current).toBe('owner');
  });

  it('returns "child" for a non-owner not in proxy (child user signed in directly)', () => {
    mockActiveProfile = { isOwner: false };
    const { result } = renderHook(() => useActiveProfileRole());
    expect(result.current).toBe('child');
  });

  it('returns "impersonated-child" when proxy mode is active', () => {
    mockActiveProfile = { isOwner: false };
    mockIsParentProxy = true;
    const { result } = renderHook(() => useActiveProfileRole());
    expect(result.current).toBe('impersonated-child');
  });

  // Defensive: even if a future bug ever flips an owner profile into proxy
  // mode, we want to hide destructive actions rather than expose them. So
  // proxy precedence must beat isOwner.
  it('prefers "impersonated-child" over "owner" if both flags somehow set', () => {
    mockActiveProfile = { isOwner: true };
    mockIsParentProxy = true;
    const { result } = renderHook(() => useActiveProfileRole());
    expect(result.current).toBe('impersonated-child');
  });
});

// ---------------------------------------------------------------------------
// [BUG-130] useActiveProfileRoleState — distinguishes loading vs missing so
// role-gated UI doesn't flash the wrong state during initial profile load.
// ---------------------------------------------------------------------------
describe('useActiveProfileRoleState [BUG-130]', () => {
  beforeEach(() => {
    mockActiveProfile = null;
    mockIsParentProxy = false;
    mockIsLoading = false;
  });

  it('[BREAK] returns isLoading=true when profile query is still resolving', () => {
    mockActiveProfile = null;
    mockIsLoading = true;
    const { result } = renderHook(() => useActiveProfileRoleState());
    expect(result.current).toEqual({ role: null, isLoading: true });
  });

  it('[BREAK] returns isLoading=false when profile query resolved with no profile', () => {
    mockActiveProfile = null;
    mockIsLoading = false;
    const { result } = renderHook(() => useActiveProfileRoleState());
    expect(result.current).toEqual({ role: null, isLoading: false });
  });

  it('returns role with isLoading=false once an owner profile loads', () => {
    mockActiveProfile = { isOwner: true };
    mockIsLoading = false;
    const { result } = renderHook(() => useActiveProfileRoleState());
    expect(result.current).toEqual({ role: 'owner', isLoading: false });
  });

  it('returns role with isLoading=false once a child profile loads', () => {
    mockActiveProfile = { isOwner: false };
    const { result } = renderHook(() => useActiveProfileRoleState());
    expect(result.current).toEqual({ role: 'child', isLoading: false });
  });

  it('returns impersonated-child role with isLoading=false when proxy is active', () => {
    mockActiveProfile = { isOwner: false };
    mockIsParentProxy = true;
    const { result } = renderHook(() => useActiveProfileRoleState());
    expect(result.current).toEqual({
      role: 'impersonated-child',
      isLoading: false,
    });
  });

  it('thin wrapper useActiveProfileRole stays compatible with role-only callers', () => {
    mockActiveProfile = { isOwner: true };
    const { result } = renderHook(() => useActiveProfileRole());
    expect(result.current).toBe('owner');
  });
});
