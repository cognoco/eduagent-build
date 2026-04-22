import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { ProfileProvider, useProfile, type Profile } from './profile';

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

const mockFetch = jest.fn();
jest.mock('./api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
  setActiveProfileId: jest.fn(),
}));

const mockProfiles: Profile[] = [
  {
    id: 'owner-id',
    accountId: 'a1',
    displayName: 'Parent',
    avatarUrl: null,
    birthYear: 1990,
    location: null,
    isOwner: true,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    pronouns: null,
    consentStatus: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'child-id',
    accountId: 'a1',
    displayName: 'Alex',
    avatarUrl: null,
    birthYear: 2012,
    location: null,
    isOwner: false,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    pronouns: null,
    consentStatus: null,
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
    mockFetch.mockReset();
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: mockProfiles }), { status: 200 })
    );
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
      'mentomate_active_profile_id',
      'owner-id'
    );
  });

  it('switchProfile updates active profile and persists to SecureStore', async () => {
    // Mock the switch POST call
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.switchProfile('child-id');
    });

    // profiles GET + switch POST (profiles query excluded from resetQueries)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'mentomate_active_profile_id',
      'child-id'
    );

    // activeProfile updates immediately via setActiveProfileId (profiles
    // query was NOT reset, so the cached list is still available).
    expect(result.current.activeProfile?.id).toBe('child-id');
  });

  it('resets data queries on profile switch (cache isolation)', async () => {
    // Simulate cached data from child A's session
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Seed query cache with data belonging to owner profile
    queryClient.setQueryData(
      ['subjects', 'owner-id'],
      [{ id: 's1', name: 'Math' }]
    );
    queryClient.setQueryData(['progress', 'overview', 'owner-id'], {
      subjects: [],
    });
    queryClient.setQueryData(['dashboard'], { children: [] });

    // Verify data is cached
    expect(queryClient.getQueryData(['subjects', 'owner-id'])).toBeTruthy();
    expect(
      queryClient.getQueryData(['progress', 'overview', 'owner-id'])
    ).toBeTruthy();

    // Switch to child profile
    await act(async () => {
      await result.current.switchProfile('child-id');
    });

    // All non-profiles queries must be reset (data cleared)
    expect(queryClient.getQueryData(['subjects', 'owner-id'])).toBeUndefined();
    expect(
      queryClient.getQueryData(['progress', 'overview', 'owner-id'])
    ).toBeUndefined();
    expect(queryClient.getQueryData(['dashboard'])).toBeUndefined();

    // Profiles query must survive (not reset) to avoid blank screen
    expect(queryClient.getQueryData(['profiles'])).toBeTruthy();
  });

  it('returns empty profiles when API returns none', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profiles: [] }), { status: 200 })
    );

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
