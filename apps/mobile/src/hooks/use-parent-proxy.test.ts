import { renderHook, waitFor } from '@testing-library/react-native';
import { useParentProxy } from './use-parent-proxy';
import * as apiClient from '../lib/api-client';
import * as SecureStore from '../lib/secure-storage';
import { createHookWrapper } from '../test-utils/app-hook-test-utils';
import type { Profile } from '../lib/profile';

const ownerProfile: Profile = {
  id: 'owner-1',
  accountId: 'test-account-id',
  displayName: 'Parent',
  avatarUrl: null,
  birthYear: 1990,
  location: null,
  isOwner: true,
  hasPremiumLlm: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  linkCreatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const childProfile: Profile = {
  id: 'child-1',
  accountId: 'test-account-id',
  displayName: 'Kid',
  avatarUrl: null,
  birthYear: 2015,
  location: null,
  isOwner: false,
  hasPremiumLlm: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  linkCreatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let setProxyModeSpy: jest.SpyInstance;
let setItemAsyncSpy: jest.SpyInstance;
let deleteItemAsyncSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  setProxyModeSpy = jest.spyOn(apiClient, 'setProxyMode');
  setItemAsyncSpy = jest
    .spyOn(SecureStore, 'setItemAsync')
    .mockResolvedValue(undefined);
  deleteItemAsyncSpy = jest
    .spyOn(SecureStore, 'deleteItemAsync')
    .mockResolvedValue(undefined);
  // Reset proxy mode state to a clean baseline
  apiClient.setProxyMode(false);
  setProxyModeSpy.mockClear();
});

afterEach(() => {
  setProxyModeSpy.mockRestore();
  setItemAsyncSpy.mockRestore();
  deleteItemAsyncSpy.mockRestore();
  apiClient.setProxyMode(false);
});

describe('useParentProxy', () => {
  it('returns isParentProxy=false when active profile is the owner', () => {
    const { wrapper } = createHookWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
    });

    const { result } = renderHook(() => useParentProxy(), { wrapper });

    expect(result.current.isParentProxy).toBe(false);
    expect(result.current.childProfile).toBeNull();
    expect(result.current.parentProfile).toEqual(ownerProfile);
  });

  it('returns isParentProxy=true when active profile is a non-owner and owner exists', () => {
    const { wrapper } = createHookWrapper({
      activeProfile: childProfile,
      profiles: [ownerProfile, childProfile],
    });

    const { result } = renderHook(() => useParentProxy(), { wrapper });

    expect(result.current.isParentProxy).toBe(true);
    expect(result.current.childProfile).toEqual(childProfile);
    expect(result.current.parentProfile).toEqual(ownerProfile);
  });

  it('calls setProxyMode(true) and writes SecureStore when proxy is active', async () => {
    const { wrapper } = createHookWrapper({
      activeProfile: childProfile,
      profiles: [ownerProfile, childProfile],
    });

    renderHook(() => useParentProxy(), { wrapper });

    await waitFor(() => {
      expect(setProxyModeSpy).toHaveBeenCalledWith(true);
      expect(setItemAsyncSpy).toHaveBeenCalledWith(
        'parent-proxy-active',
        'true',
      );
    });
  });

  it('calls setProxyMode(false) and deletes SecureStore when proxy is not active', async () => {
    const { wrapper } = createHookWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile, childProfile],
    });

    renderHook(() => useParentProxy(), { wrapper });

    await waitFor(() => {
      expect(setProxyModeSpy).toHaveBeenCalledWith(false);
      expect(deleteItemAsyncSpy).toHaveBeenCalledWith('parent-proxy-active');
    });
  });

  it('returns isParentProxy=false for a solo owner account with no children', () => {
    const { wrapper } = createHookWrapper({
      activeProfile: ownerProfile,
      profiles: [ownerProfile],
    });

    const { result } = renderHook(() => useParentProxy(), { wrapper });

    expect(result.current.isParentProxy).toBe(false);
  });

  it('does not clear stored proxy state while the active profile is still loading', async () => {
    const { wrapper } = createHookWrapper({
      activeProfile: null,
      profiles: [ownerProfile, childProfile],
    });

    renderHook(() => useParentProxy(), { wrapper });

    expect(setProxyModeSpy).not.toHaveBeenCalled();
    expect(deleteItemAsyncSpy).not.toHaveBeenCalled();
  });
});
