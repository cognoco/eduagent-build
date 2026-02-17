import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { ProfileProvider, useProfile, type Profile } from './profile';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('./auth-api', () => ({
  useApi: () => ({ get: mockGet, post: mockPost }),
}));

const mockProfiles: Profile[] = [
  {
    id: 'owner-id',
    accountId: 'a1',
    displayName: 'Parent',
    avatarUrl: null,
    birthDate: null,
    personaType: 'PARENT',
    isOwner: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'child-id',
    accountId: 'a1',
    displayName: 'Alex',
    avatarUrl: null,
    birthDate: '2012-05-15',
    personaType: 'TEEN',
    isOwner: false,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileProvider>{children}</ProfileProvider>
      </QueryClientProvider>
    );
  };
}

describe('ProfileProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    mockGet.mockResolvedValue({ profiles: mockProfiles });
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('fetches profiles and selects owner as active by default', async () => {
    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profiles).toEqual(mockProfiles);
    expect(result.current.activeProfile?.id).toBe('owner-id');
    expect(result.current.activeProfile?.displayName).toBe('Parent');
  });

  it('restores active profile from SecureStore', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('child-id');

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeProfile?.id).toBe('child-id');
    expect(result.current.activeProfile?.displayName).toBe('Alex');
  });

  it('falls back to owner when saved ID is stale', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('deleted-id');

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeProfile?.id).toBe('owner-id');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'eduagent_active_profile_id',
      'owner-id'
    );
  });

  it('switchProfile updates active profile and persists to SecureStore', async () => {
    mockPost.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.switchProfile('child-id');
    });

    expect(mockPost).toHaveBeenCalledWith('/profiles/switch', {
      profileId: 'child-id',
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'eduagent_active_profile_id',
      'child-id'
    );
    expect(result.current.activeProfile?.id).toBe('child-id');
  });

  it('returns empty profiles when API returns none', async () => {
    mockGet.mockResolvedValue({ profiles: [] });

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profiles).toEqual([]);
    expect(result.current.activeProfile).toBeNull();
  });
});
