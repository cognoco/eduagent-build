// ---------------------------------------------------------------------------
// use-freeform-keep-handler hook tests
// ---------------------------------------------------------------------------

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';
import type { Bookmark } from '@eduagent/schemas';
import {
  createHookWrapper,
  createTestProfile,
} from '../../../../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../../../../lib/api-client';
import { useFreeformKeepHandler } from './use-freeform-keep-handler';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

const EVENT_ID = 'e0000000-0000-4000-8000-000000000001';

function createBookmarkFixture(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 'e0000000-0000-4000-8000-000000000002',
    eventId: EVENT_ID,
    sessionId: 'e0000000-0000-4000-8000-000000000003',
    subjectId: 'e0000000-0000-4000-8000-000000000004',
    topicId: null,
    subjectName: 'Biology',
    topicTitle: null,
    content: 'Photosynthesis converts light into chemical energy.',
    artifactSource: 'freeform_keep',
    verificationState: 'unverified',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
  // platformAlert delegates to Alert.alert on non-web platforms in Jest.
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useFreeformKeepHandler', () => {
  it('calls createBookmark with the given eventId and marks keepSaved on success', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ bookmark: createBookmarkFixture() }), {
        status: 201,
      }),
    );

    const { result } = renderHook(() => useFreeformKeepHandler(), {
      wrapper: createWrapper(),
    });

    expect(result.current.keepSaved).toBe(false);

    await act(async () => {
      await result.current.handleKeepNow(EVENT_ID);
    });

    await waitFor(() => {
      expect(result.current.keepSaved).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [unknown, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ eventId: EVENT_ID });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('treats a duplicate (409 conflict) re-tap as already-saved, not an error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Bookmark already exists' }), {
        status: 409,
      }),
    );

    const { result } = renderHook(() => useFreeformKeepHandler(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleKeepNow(EVENT_ID);
    });

    await waitFor(() => {
      expect(result.current.keepSaved).toBe(true);
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('alerts and keeps keepSaved false on a genuine failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    const { result } = renderHook(() => useFreeformKeepHandler(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleKeepNow(EVENT_ID);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });

    expect(result.current.keepSaved).toBe(false);
  });

  it('does not re-invoke the mutation once already saved', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ bookmark: createBookmarkFixture() }), {
        status: 201,
      }),
    );

    const { result } = renderHook(() => useFreeformKeepHandler(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleKeepNow(EVENT_ID);
    });

    await waitFor(() => {
      expect(result.current.keepSaved).toBe(true);
    });

    await act(async () => {
      await result.current.handleKeepNow(EVENT_ID);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('resetKeepSaved allows a fresh keep in a subsequent session', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ bookmark: createBookmarkFixture() }), {
        status: 201,
      }),
    );

    const { result } = renderHook(() => useFreeformKeepHandler(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleKeepNow(EVENT_ID);
    });

    await waitFor(() => {
      expect(result.current.keepSaved).toBe(true);
    });

    // Session boundary — the screen's reset effect calls resetKeepSaved().
    act(() => {
      result.current.resetKeepSaved();
    });

    expect(result.current.keepSaved).toBe(false);

    const OTHER_EVENT_ID = 'e0000000-0000-4000-8000-000000000005';
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          bookmark: createBookmarkFixture({ eventId: OTHER_EVENT_ID }),
        }),
        { status: 201 },
      ),
    );

    await act(async () => {
      await result.current.handleKeepNow(OTHER_EVENT_ID);
    });

    await waitFor(() => {
      expect(result.current.keepSaved).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
