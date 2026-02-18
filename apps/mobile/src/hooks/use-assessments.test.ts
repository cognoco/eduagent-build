import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAssessment,
  useCreateAssessment,
  useSubmitAnswer,
} from './use-assessments';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ get: mockGet, post: mockPost }),
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'test-profile-id' },
  }),
}));

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

describe('useAssessment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches assessment by ID', async () => {
    mockGet.mockResolvedValue({
      assessment: {
        id: 'assess-1',
        topicId: 'topic-1',
        verificationDepth: 'recall',
        status: 'in_progress',
        masteryScore: null,
        createdAt: '2026-02-15T10:00:00.000Z',
      },
    });

    const { result } = renderHook(() => useAssessment('assess-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/assessments/assess-1');
    expect(result.current.data?.id).toBe('assess-1');
    expect(result.current.data?.status).toBe('in_progress');
  });

  it('handles API errors', async () => {
    mockGet.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useAssessment('assess-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useCreateAssessment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('creates assessment via POST', async () => {
    mockPost.mockResolvedValue({
      assessment: {
        id: 'new-assess',
        topicId: 'topic-1',
        verificationDepth: 'recall',
        status: 'in_progress',
        masteryScore: null,
        createdAt: '2026-02-15T10:00:00.000Z',
      },
    });

    const { result } = renderHook(
      () => useCreateAssessment('sub-1', 'topic-1'),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/subjects/sub-1/topics/topic-1/assessments',
      { subjectId: 'sub-1', topicId: 'topic-1' }
    );
  });
});

describe('useSubmitAnswer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('submits answer via POST', async () => {
    mockPost.mockResolvedValue({
      result: {
        passed: true,
        masteryScore: 0.85,
        feedback: 'Well done!',
      },
    });

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

    expect(mockPost).toHaveBeenCalledWith('/assessments/assess-1/answer', {
      answer: 'Photosynthesis converts light into energy.',
    });
    expect(result.current.data?.result.passed).toBe(true);
  });

  it('handles submission errors', async () => {
    mockPost.mockRejectedValue(new Error('Submission failed'));

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
