import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useActiveAssessment,
  useAssessment,
  useCreateAssessment,
  useSubmitAnswer,
} from './use-assessments';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

const ASSESSMENT_ID = '40000000-0000-4000-8000-000000000001';
const CREATED_ASSESSMENT_ID = '40000000-0000-4000-8000-000000000002';
const ACTIVE_ASSESSMENT_ID = '40000000-0000-4000-8000-000000000003';
const PROFILE_ID = '50000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '60000000-0000-4000-8000-000000000001';
const TOPIC_ID = '70000000-0000-4000-8000-000000000001';

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
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useAssessment', () => {
  it('fetches assessment by ID', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          assessment: {
            id: ASSESSMENT_ID,
            profileId: PROFILE_ID,
            subjectId: SUBJECT_ID,
            topicId: TOPIC_ID,
            sessionId: null,
            verificationDepth: 'recall',
            status: 'in_progress',
            masteryScore: null,
            qualityRating: null,
            exchangeHistory: [],
            createdAt: '2026-02-15T10:00:00.000Z',
            updatedAt: '2026-02-15T10:00:00.000Z',
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useAssessment('assess-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.id).toBe(ASSESSMENT_ID);
    expect(result.current.data?.status).toBe('in_progress');
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    const { result } = renderHook(() => useAssessment('assess-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useCreateAssessment', () => {
  it('creates assessment via POST', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          assessment: {
            id: CREATED_ASSESSMENT_ID,
            topicId: TOPIC_ID,
            verificationDepth: 'recall',
            status: 'in_progress',
            masteryScore: null,
            createdAt: '2026-02-15T10:00:00.000Z',
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(
      () => useCreateAssessment('sub-1', 'topic-1'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useActiveAssessment', () => {
  it('fetches an active assessment for a topic', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          assessment: {
            id: ACTIVE_ASSESSMENT_ID,
            profileId: PROFILE_ID,
            subjectId: SUBJECT_ID,
            topicId: TOPIC_ID,
            sessionId: null,
            verificationDepth: 'explain',
            status: 'in_progress',
            masteryScore: 0.5,
            qualityRating: 4,
            exchangeHistory: [
              { role: 'user', content: 'ciao, buongiorno' },
              {
                role: 'assistant',
                content:
                  'Good start. Pick one phrase and say when you would use it.',
              },
            ],
            createdAt: '2026-02-15T10:00:00.000Z',
            updatedAt: '2026-02-15T10:01:00.000Z',
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(
      () => useActiveAssessment('sub-1', 'topic-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.id).toBe(ACTIVE_ASSESSMENT_ID);
    expect(result.current.data?.exchangeHistory).toHaveLength(2);
  });
});

describe('useSubmitAnswer', () => {
  it('submits answer via POST', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          evaluation: {
            passed: true,
            shouldEscalateDepth: false,
            masteryScore: 0.85,
            qualityRating: 4,
            feedback: 'Well done!',
          },
          status: 'passed',
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useSubmitAnswer('assess-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        answer: 'Photosynthesis converts light into energy.',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.evaluation.passed).toBe(true);
  });

  it('uses the mutation assessment id when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          evaluation: {
            passed: true,
            shouldEscalateDepth: false,
            masteryScore: 0.85,
            qualityRating: 4,
            feedback: 'Well done!',
          },
          status: 'passed',
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useSubmitAnswer(''), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        assessmentId: 'created-assess-1',
        answer: 'Photosynthesis converts light into energy.',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const request = mockFetch.mock.calls[0]?.[0] as Request | URL | string;
    const requestUrl =
      typeof request === 'string'
        ? request
        : request instanceof URL
          ? request.toString()
          : request.url;
    expect(requestUrl).toContain('/assessments/created-assess-1/answer');
  });

  it('handles submission errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Submission failed', { status: 500 }),
    );

    const { result } = renderHook(() => useSubmitAnswer('assess-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ answer: 'Wrong answer' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
