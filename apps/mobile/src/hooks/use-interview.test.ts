import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInterviewState, useSendInterviewMessage } from './use-interview';

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

describe('useInterviewState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns interview state from API', async () => {
    mockGet.mockResolvedValue({
      state: {
        draftId: 'draft-1',
        status: 'in_progress',
        exchangeCount: 2,
        subjectName: 'Math',
      },
    });

    const { result } = renderHook(() => useInterviewState('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/subjects/subject-1/interview');
    expect(result.current.data).toEqual({
      draftId: 'draft-1',
      status: 'in_progress',
      exchangeCount: 2,
      subjectName: 'Math',
    });
  });

  it('returns null when no interview exists', async () => {
    mockGet.mockResolvedValue({ state: null });

    const { result } = renderHook(() => useInterviewState('subject-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('is disabled when subjectId is empty', () => {
    const { result } = renderHook(() => useInterviewState(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('useSendInterviewMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('sends interview message and returns response', async () => {
    mockPost.mockResolvedValue({
      response: 'What are your goals?',
      isComplete: false,
      exchangeCount: 1,
    });

    const { result } = renderHook(() => useSendInterviewMessage('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('I want to learn calculus');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/subjects/subject-1/interview', {
      message: 'I want to learn calculus',
    });
    expect(result.current.data?.response).toBe('What are your goals?');
    expect(result.current.data?.isComplete).toBe(false);
  });

  it('returns isComplete when interview finishes', async () => {
    mockPost.mockResolvedValue({
      response: 'Great, I have enough to create your curriculum!',
      isComplete: true,
      exchangeCount: 4,
    });

    const { result } = renderHook(() => useSendInterviewMessage('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('I want to focus on integration');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.isComplete).toBe(true);
    expect(result.current.data?.exchangeCount).toBe(4);
  });

  it('handles API errors gracefully', async () => {
    mockPost.mockRejectedValue(new Error('API error 500: Internal error'));

    const { result } = renderHook(() => useSendInterviewMessage('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('test message');
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('API error 500: Internal error');
  });
});
