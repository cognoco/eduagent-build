import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NowOverflowResponse, NowResponse } from '@eduagent/schemas';

import { createHookWrapper } from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { buildNowFeedCacheKey, readCachedNowFeed } from '../lib/now-feed-cache';
import { useNowFeed, useNowOverflow } from './use-now-feed';

function feed(overrides: Partial<NowResponse> = {}): NowResponse {
  return {
    scope: 'self',
    cards: [],
    overflowCount: 0,
    generatedAt: '2026-06-14T08:00:00.000Z',
    ...overrides,
  };
}

function overflow(
  overrides: Partial<NowOverflowResponse> = {},
): NowOverflowResponse {
  return {
    scope: 'self',
    items: [],
    ...overrides,
  };
}

describe('useNowFeed', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    jest.useRealTimers();
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    setActiveProfileId('test-profile-id');
    await AsyncStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  it('returns the parsed feed and mirrors it into the profile-scoped cache', async () => {
    const value = feed();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(value), { status: 200 }),
    );
    const { queryClient, wrapper } = createHookWrapper();

    const { result } = renderHook(() => useNowFeed(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(value);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('/v1/now');
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('scope=self');
    await expect(readCachedNowFeed('test-profile-id')).resolves.toEqual(value);

    queryClient.clear();
  });

  it('surfaces a rejected request as query error without throwing from render', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const { queryClient, wrapper } = createHookWrapper();

    const { result } = renderHook(() => useNowFeed(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.fallbackFeed).toBeNull();

    queryClient.clear();
  });

  it('exposes a cached feed after the live request stays pending for 2 seconds', async () => {
    jest.useFakeTimers();
    const cached = feed({ generatedAt: '2026-06-14T07:59:00.000Z' });
    await AsyncStorage.setItem(
      buildNowFeedCacheKey('test-profile-id'),
      JSON.stringify(cached),
    );
    mockFetch.mockReturnValue(new Promise(() => undefined));
    const { queryClient, wrapper } = createHookWrapper();

    const { result } = renderHook(() => useNowFeed(), { wrapper });

    await act(async () => {
      jest.advanceTimersByTime(2_001);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.fallbackFeed).toEqual(cached));
    expect(result.current.isSlowFallback).toBe(true);

    queryClient.clear();
    jest.useRealTimers();
  });
});

describe('useNowOverflow', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    setActiveProfileId('test-profile-id');
    await AsyncStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  it('stays idle until enabled, then returns parsed overflow rows', async () => {
    const value = overflow();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(value), { status: 200 }),
    );
    const { queryClient, wrapper } = createHookWrapper();

    const disabled = renderHook(() => useNowOverflow(false), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(disabled.result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
    disabled.unmount();

    const enabled = renderHook(() => useNowOverflow(true), { wrapper });
    await waitFor(() => expect(enabled.result.current.isSuccess).toBe(true));
    expect(enabled.result.current.data).toEqual(value);

    queryClient.clear();
  });
});
