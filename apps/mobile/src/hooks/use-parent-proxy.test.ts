import { renderHook, waitFor } from '@testing-library/react-native';
import { useParentProxy } from './use-parent-proxy';
import { useProfile } from '../lib/profile';
import { setProxyMode } from '../lib/api-client';
import * as SecureStore from '../lib/secure-storage';

jest.mock('../lib/profile', () => ({
  useProfile: jest.fn(),
}));

jest.mock('../lib/api-client', () => ({
  setProxyMode: jest.fn(),
}));

jest.mock('../lib/secure-storage', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const ownerProfile = {
  id: 'owner-1',
  displayName: 'Parent',
  isOwner: true,
  birthYear: 1990,
};

const childProfile = {
  id: 'child-1',
  displayName: 'Kid',
  isOwner: false,
  birthYear: 2015,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useParentProxy', () => {
  it('returns isParentProxy=false when active profile is the owner', () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
    });

    const { result } = renderHook(() => useParentProxy());

    expect(result.current.isParentProxy).toBe(false);
    expect(result.current.childProfile).toBeNull();
    expect(result.current.parentProfile).toEqual(ownerProfile);
  });

  it('returns isParentProxy=true when active profile is a non-owner and owner exists', () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
    });

    const { result } = renderHook(() => useParentProxy());

    expect(result.current.isParentProxy).toBe(true);
    expect(result.current.childProfile).toEqual(childProfile);
    expect(result.current.parentProfile).toEqual(ownerProfile);
  });

  it('calls setProxyMode(true) and writes SecureStore when proxy is active', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: childProfile,
    });

    renderHook(() => useParentProxy());

    await waitFor(() => {
      expect(setProxyMode).toHaveBeenCalledWith(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'parent-proxy-active',
        'true'
      );
    });
  });

  it('calls setProxyMode(false) and deletes SecureStore when proxy is not active', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: ownerProfile,
    });

    renderHook(() => useParentProxy());

    await waitFor(() => {
      expect(setProxyMode).toHaveBeenCalledWith(false);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        'parent-proxy-active'
      );
    });
  });

  it('returns isParentProxy=false for a solo owner account with no children', () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile],
      activeProfile: ownerProfile,
    });

    const { result } = renderHook(() => useParentProxy());

    expect(result.current.isParentProxy).toBe(false);
  });

  it('does not clear stored proxy state while the active profile is still loading', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profiles: [ownerProfile, childProfile],
      activeProfile: null,
    });

    renderHook(() => useParentProxy());

    expect(setProxyMode).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
