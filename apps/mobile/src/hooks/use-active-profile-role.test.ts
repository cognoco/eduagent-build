import { renderHook } from '@testing-library/react-native';

let mockActiveProfile: { isOwner: boolean } | null = null;
let mockIsParentProxy = false;

jest.mock('../lib/profile', () => ({
  useProfile: () => ({ activeProfile: mockActiveProfile }),
}));

jest.mock('./use-parent-proxy', () => ({
  useParentProxy: () => ({ isParentProxy: mockIsParentProxy }),
}));

const { useActiveProfileRole } = require('./use-active-profile-role');

describe('useActiveProfileRole', () => {
  beforeEach(() => {
    mockActiveProfile = null;
    mockIsParentProxy = false;
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
