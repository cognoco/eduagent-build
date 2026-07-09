// ---------------------------------------------------------------------------
// use-challenge-round hook tests
// ---------------------------------------------------------------------------

import { renderHook, act } from '@testing-library/react-native';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import { useChallengeRound } from './use-challenge-round';

// External boundary mocks - Clerk auth and native fetch
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}));

// Mock profile (internal lib - but useProfile is a React context wrapper
// that would require a full provider tree in tests; mock at the boundary
// of the React context, not the internal service)
jest.mock(
  '../lib/profile' /* gc1-allow: useProfile wraps React context; needs full provider tree */,
  () => ({
    ...jest.requireActual('../lib/profile'),
    useProfile: () => ({ activeProfile: { id: 'test-profile-id' } }),
  }),
);

// Mock useCreateNote - we only verify the mutateAsync call shape here.
// The full useCreateNote behaviour is covered in use-notes.test.ts.
const mockMutateAsync = jest.fn();
jest.mock(
  './use-notes' /* gc1-allow: wraps QueryClient+Hono client internals */,
  () => ({
    useCreateNote: () => ({
      mutateAsync: mockMutateAsync,
    }),
  }),
);

// Spy on global fetch - the hook uses raw fetch for untyped routes
const mockFetch = jest.fn();
global.fetch = mockFetch;

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8787';

const opts = {
  sessionId: 'session-uuid',
  topicId: 'topic-uuid',
  subjectId: 'subject-uuid',
  bookId: 'book-uuid',
};

function createWrapper() {
  return createQueryWrapper().wrapper;
}

describe('useChallengeRound', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockMutateAsync.mockReset();
  });

  it('returns all expected action functions', () => {
    const { result } = renderHook(() => useChallengeRound(opts), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.accept).toBe('function');
    expect(typeof result.current.decline).toBe('function');
    expect(typeof result.current.abort).toBe('function');
    expect(typeof result.current.saveNote).toBe('function');
    expect(typeof result.current.skipNote).toBe('function');
  });

  it('accept() POSTs to /v1/challenge-round/accept with sessionId and topicId', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useChallengeRound(opts), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.accept();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8787/v1/challenge-round/accept');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.sessionId).toBe('session-uuid');
    expect(body.topicId).toBe('topic-uuid');
  });

  it('saveNote() calls createNote.mutateAsync with topicId, sessionId, and content', async () => {
    mockMutateAsync.mockResolvedValueOnce({ note: { id: 'note-1' } });

    const { result } = renderHook(() => useChallengeRound(opts), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.saveNote('My challenge note content');
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      topicId: 'topic-uuid',
      sessionId: 'session-uuid',
      content: 'My challenge note content',
    });
  });

  it('skipNote() resolves immediately without calling fetch', async () => {
    const { result } = renderHook(() => useChallengeRound(opts), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.skipNote();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('decline() includes dontAskAgain in the request body', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const { result } = renderHook(() => useChallengeRound(opts), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.decline(true);
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8787/v1/challenge-round/decline');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.dontAskAgain).toBe(true);
  });

  it('abort() POSTs sessionId and topicId', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const { result } = renderHook(() => useChallengeRound(opts), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.abort();
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8787/v1/challenge-round/abort');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.sessionId).toBe('session-uuid');
    expect(body.topicId).toBe('topic-uuid');
  });
});
