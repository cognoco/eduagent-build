import { renderHook } from '@testing-library/react-native';

import { useFamilyPresence } from './use-family-presence';

const mockUseDashboard = jest.fn();
const mockUseActiveProfileRole = jest.fn();

jest.mock('./use-dashboard', () => ({
  useDashboard: () => mockUseDashboard(),
}));

jest.mock('./use-active-profile-role', () => ({
  useActiveProfileRole: () => mockUseActiveProfileRole(),
}));

describe('useFamilyPresence', () => {
  beforeEach(() => {
    mockUseDashboard.mockReset();
    mockUseActiveProfileRole.mockReset();
    mockUseActiveProfileRole.mockReturnValue('owner');
  });

  it('returns hasFamily=false while loading', () => {
    mockUseDashboard.mockReturnValue({ data: undefined, isLoading: true });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: false, isLoading: true });
  });

  it('returns hasFamily=false when children list is empty', () => {
    mockUseDashboard.mockReturnValue({
      data: { children: [], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: false, isLoading: false });
  });

  it('returns hasFamily=true when at least one child is linked', () => {
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'c1' }], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: true, isLoading: false });
  });

  it('does not treat demoMode children as real family links', () => {
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'demo' }], demoMode: true },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current.hasFamily).toBe(false);
  });

  it('returns hasFamily=false for child profiles even with children data', () => {
    mockUseActiveProfileRole.mockReturnValue('child');
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'c1' }], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: false, isLoading: false });
  });

  it('returns hasFamily=false while impersonating a child', () => {
    mockUseActiveProfileRole.mockReturnValue('impersonated-child');
    mockUseDashboard.mockReturnValue({
      data: { children: [{ profileId: 'c1' }], demoMode: false },
      isLoading: false,
    });
    const { result } = renderHook(() => useFamilyPresence());
    expect(result.current).toEqual({ hasFamily: false, isLoading: false });
  });
});
