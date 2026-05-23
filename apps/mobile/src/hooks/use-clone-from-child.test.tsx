import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
  getRequestJsonBody,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useCloneFromChild,
  type CloneFromChildArgs,
} from './use-clone-from-child';

const mockFetch = jest.fn();
const mockPush = jest.fn();
const mockRandomUUID = jest.fn();
const mockTrack = jest.fn();
const mockHashProfileId = jest.fn((profileId: string) => `hash:${profileId}`);

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn(async () => 'test-token') }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => mockRandomUUID(),
}));

jest.mock('../lib/analytics', () => ({
  hashProfileId: (...args: [string]) => mockHashProfileId(...args),
  track: (...args: unknown[]) => mockTrack(...args),
}));

const originalFetch = globalThis.fetch;

const ADULT_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440010';
const CHILD_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440011';
const TOPIC_ID = '550e8400-e29b-41d4-a716-446655440012';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440013';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440014';
const FORCE_REQUEST_ID = '550e8400-e29b-41d4-a716-446655440015';

let queryClient: QueryClient;

function createWrapper() {
  const wrapper = createHookWrapper({
    activeProfile: createTestProfile({
      id: ADULT_PROFILE_ID,
      birthYear: 1985,
      isOwner: true,
    }),
  });
  queryClient = wrapper.queryClient;
  return wrapper.wrapper;
}

function cloneArgs(
  overrides: Partial<CloneFromChildArgs> = {},
): CloneFromChildArgs {
  return {
    childProfileId: CHILD_PROFILE_ID,
    topicId: TOPIC_ID,
    topicTitle: 'Fractions',
    subjectName: 'Math',
    childDisplayName: 'Ada',
    triggerPath: `/child/${CHILD_PROFILE_ID}/curriculum`,
    ...overrides,
  };
}

function cloneResponse(
  overrides: Partial<{
    topicId: string;
    subjectId: string;
    alreadyExisted: boolean;
    descriptionDivergent: boolean;
    descriptionRefreshed: boolean;
    topicState: 'unstarted' | 'in_progress' | 'completed';
    createdIds: { topicId?: string; bookId?: string; subjectId?: string };
  }> = {},
) {
  return {
    topicId: TOPIC_ID,
    subjectId: SUBJECT_ID,
    alreadyExisted: false,
    descriptionDivergent: false,
    descriptionRefreshed: false,
    topicState: 'unstarted' as const,
    createdIds: { topicId: TOPIC_ID },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockRandomUUID.mockReset();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId(ADULT_PROFILE_ID);
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useCloneFromChild', () => {
  it('posts the clone request and opens relearn with child provenance params', async () => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(jsonResponse(cloneResponse()));

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.message).toBe(
        'Added "Fractions" to your Math.',
      );
    });

    expect(getRequestJsonBody(mockFetch, 0)).toMatchObject({
      childProfileId: CHILD_PROFILE_ID,
      topicId: TOPIC_ID,
      requestId: REQUEST_ID,
    });
    expect(mockTrack).toHaveBeenCalledWith(
      'add_to_my_learning.bridge',
      expect.objectContaining({
        adultProfileHash: `hash:${ADULT_PROFILE_ID}`,
        childProfileHash: `hash:${CHILD_PROFILE_ID}`,
        triggerSurface: 'child_curriculum_detail',
      }),
    );

    act(() => result.current.toast?.primaryAction?.onPress());

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: {
        childProfileId: CHILD_PROFILE_ID,
        topicId: TOPIC_ID,
        subjectId: SUBJECT_ID,
        topicName: 'Fractions',
        subjectName: 'Math',
        returnTo: 'family-children',
        returnId: CHILD_PROFILE_ID,
        source: 'parent_bridge',
      },
    });
  });

  it.each([
    {
      name: 'in-progress topic',
      response: cloneResponse({
        alreadyExisted: true,
        topicState: 'in_progress',
        createdIds: {},
      }),
      expectedMessage: '"Fractions" is in your Math - you\'re working on it.',
      expectedActionLabel: 'Resume',
    },
    {
      name: 'completed topic',
      response: cloneResponse({
        alreadyExisted: true,
        topicState: 'completed',
        createdIds: {},
      }),
      expectedMessage: 'You\'ve already learned "Fractions".',
      expectedActionLabel: 'Review',
    },
    {
      name: 'refreshed unstarted topic',
      response: cloneResponse({
        alreadyExisted: true,
        descriptionRefreshed: true,
        createdIds: {},
      }),
      expectedMessage:
        'Updated "Fractions" in your Math with their latest version.',
      expectedActionLabel: 'Open',
    },
    {
      name: 'same existing topic',
      response: cloneResponse({
        alreadyExisted: true,
        createdIds: {},
      }),
      expectedMessage: '"Fractions" is already in your Math.',
      expectedActionLabel: 'Open',
    },
  ])('surfaces the right toast for $name', async (scenario) => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(jsonResponse(scenario.response));

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.message).toBe(scenario.expectedMessage);
    });
    expect(result.current.toast?.primaryAction?.label).toBe(
      scenario.expectedActionLabel,
    );
  });

  it('offers force-copy when the adult copy diverges from the child version', async () => {
    mockRandomUUID
      .mockReturnValueOnce(REQUEST_ID)
      .mockReturnValueOnce(FORCE_REQUEST_ID);
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(
          cloneResponse({
            alreadyExisted: true,
            descriptionDivergent: true,
            topicState: 'in_progress',
            createdIds: {},
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          cloneResponse({
            topicId: '550e8400-e29b-41d4-a716-446655440016',
            createdIds: { topicId: '550e8400-e29b-41d4-a716-446655440016' },
          }),
        ),
      );

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.secondaryAction?.label).toBe(
        'Add separate copy',
      );
    });

    act(() => result.current.toast?.secondaryAction?.onPress());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    expect(getRequestJsonBody(mockFetch, 1)).toMatchObject({
      childProfileId: CHILD_PROFILE_ID,
      topicId: TOPIC_ID,
      forceCopy: true,
      requestId: FORCE_REQUEST_ID,
    });
  });

  it('shows not-found errors without exposing raw API details', async () => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 'NOT_FOUND', message: 'Topic not found' }, 404),
    );

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast).toMatchObject({
        kind: 'error',
        message: 'This topic is no longer available.',
      });
    });
  });

  it('keeps the open action when undo fails because a session already started', async () => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch
      .mockResolvedValueOnce(jsonResponse(cloneResponse()))
      .mockResolvedValueOnce(
        jsonResponse({
          deleted: { topic: false },
          reason: 'session_started',
        }),
      );

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.secondaryAction?.label).toBe('Undo');
    });

    act(() => result.current.toast?.secondaryAction?.onPress());

    await waitFor(() => {
      expect(result.current.toast).toMatchObject({
        kind: 'error',
        message: "Couldn't undo - you've already opened this topic.",
      });
    });

    act(() => result.current.toast?.primaryAction?.onPress());

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/topic/relearn',
        params: expect.objectContaining({
          childProfileId: CHILD_PROFILE_ID,
          topicId: TOPIC_ID,
          subjectId: SUBJECT_ID,
          source: 'parent_bridge',
        }),
      }),
    );
  });
});
