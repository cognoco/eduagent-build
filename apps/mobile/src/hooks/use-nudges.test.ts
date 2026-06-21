import { act, renderHook } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';

import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useMarkAllNudgesRead, useMarkNudgeRead } from './use-nudges';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

function createWrapper(activeProfile = createTestProfile()) {
  const wrapped = createHookWrapper({ activeProfile });
  queryClient = wrapped.queryClient;
  return wrapped.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useMarkNudgeRead', () => {
  it('does not invalidate unread nudges with an undefined profile id', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, count: 1 }), {
        status: 200,
      }),
    );
    const wrapper = createWrapper(null);
    setActiveProfileId(undefined);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMarkNudgeRead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('nudge-1');
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['nudges', 'unread', undefined],
    });
  });
});

describe('useMarkAllNudgesRead', () => {
  it('does not invalidate unread nudges with an undefined profile id', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, count: 2 }), {
        status: 200,
      }),
    );
    const wrapper = createWrapper(null);
    setActiveProfileId(undefined);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMarkAllNudgesRead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['nudges', 'unread', undefined],
    });
  });
});
