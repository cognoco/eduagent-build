import { renderHook, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useResolveSubject } from './use-resolve-subject';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

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

describe('useResolveSubject', () => {
  it('calls POST /subjects/resolve with rawInput and returns result', async () => {
    const resolveResult = {
      status: 'resolved',
      resolvedName: 'Mathematics',
      suggestions: [],
      displayMessage: 'Mathematics',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(resolveResult), { status: 200 }),
    );

    const { result } = renderHook(() => useResolveSubject(), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync({ rawInput: 'math' });
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!).toEqual(resolveResult);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: 'Bad request', code: 'VALIDATION_ERROR' },
        }),
        { status: 400 },
      ),
    );

    const { result } = renderHook(() => useResolveSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ rawInput: '' }),
      ).rejects.toThrow();
    });
  });

  it('starts in idle state before mutation is called', () => {
    const { result } = renderHook(() => useResolveSubject(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
