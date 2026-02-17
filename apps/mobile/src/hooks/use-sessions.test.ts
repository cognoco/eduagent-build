import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useStartSession,
  useSendMessage,
  useCloseSession,
} from './use-sessions';

const mockPost = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ post: mockPost }),
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

describe('useStartSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subjects/:subjectId/sessions', async () => {
    mockPost.mockResolvedValue({
      session: {
        id: 'session-1',
        subjectId: 'subject-1',
        sessionType: 'learning',
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        startedAt: '2025-01-01T00:00:00Z',
        lastActivityAt: '2025-01-01T00:00:00Z',
        endedAt: null,
        durationSeconds: null,
      },
    });

    const { result } = renderHook(() => useStartSession('subject-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ subjectId: 'subject-1' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/subjects/subject-1/sessions', {
      subjectId: 'subject-1',
    });
  });
});

describe('useSendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /sessions/:sessionId/messages', async () => {
    mockPost.mockResolvedValue({
      response: 'AI response',
      escalationRung: 1,
      isUnderstandingCheck: false,
      exchangeCount: 1,
    });

    const { result } = renderHook(() => useSendMessage('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ message: 'What is gravity?' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/sessions/session-1/messages', {
      message: 'What is gravity?',
    });
    expect(result.current.data?.response).toBe('AI response');
  });
});

describe('useCloseSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /sessions/:sessionId/close', async () => {
    mockPost.mockResolvedValue({
      message: 'Session closed',
      sessionId: 'session-1',
    });

    const { result } = renderHook(() => useCloseSession('session-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/sessions/session-1/close', {});
  });
});
