import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';

import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useChildCapNotifications,
  useDismissChildCapNotification,
  useNotifyParentChildCap,
} from './use-child-cap-notifications';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

const OWNER_PROFILE_ID = 'a0000000-0000-4000-8000-000000000010';
const CHILD_PROFILE_ID = 'a0000000-0000-4000-8000-000000000020';

function createWrapper() {
  const wrapped = createHookWrapper({
    activeProfile: createTestProfile({ id: OWNER_PROFILE_ID, isOwner: true }),
  });
  queryClient = wrapped.queryClient;
  return wrapped.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId(OWNER_PROFILE_ID);
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useChildCapNotifications', () => {
  it('fetches active child-cap notifications for the active owner profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          notifications: [
            {
              id: 'b0000000-0000-4000-8000-000000000001',
              ownerProfileId: OWNER_PROFILE_ID,
              childProfileId: CHILD_PROFILE_ID,
              childDisplayName: 'Emma',
              kind: 'daily_exceeded',
              occurredOn: '2026-05-26',
              resetsAt: '2026-05-27T01:00:00.000Z',
              createdAt: '2026-05-26T12:00:00.000Z',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useChildCapNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.[0]).toMatchObject({
      childDisplayName: 'Emma',
      kind: 'daily_exceeded',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/child-cap'),
      expect.any(Object),
    );
  });
});

describe('useDismissChildCapNotification', () => {
  it('posts dismiss and invalidates the owner notification query', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDismissChildCapNotification(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('b0000000-0000-4000-8000-000000000001');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/notifications/child-cap/b0000000-0000-4000-8000-000000000001/dismiss',
      ),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['child-cap-notifications', OWNER_PROFILE_ID],
    });
  });
});

describe('useNotifyParentChildCap', () => {
  it('uses the quota-specific child notification endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useNotifyParentChildCap(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        kind: 'monthly_exceeded',
        resetsAt: '2026-06-01T00:00:00.000Z',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/child-cap/notify-parent'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          kind: 'monthly_exceeded',
          resetsAt: '2026-06-01T00:00:00.000Z',
        }),
      }),
    );
  });
});
