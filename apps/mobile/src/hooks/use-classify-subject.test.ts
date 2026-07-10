import { renderHook, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useClassifySubject } from './use-classify-subject';

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

describe('useClassifySubject', () => {
  it('calls POST /subjects/classify with text and returns classification', async () => {
    const classifyResult = {
      candidates: [
        {
          subjectId: '550e8400-e29b-41d4-a716-446655440000',
          subjectName: 'Mathematics',
          confidence: 0.95,
        },
      ],
      needsConfirmation: false,
      suggestedSubjectName: 'Mathematics',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(classifyResult), { status: 200 }),
    );

    const { result } = renderHook(() => useClassifySubject(), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync({
        text: 'algebra and equations',
      });
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!).toEqual(classifyResult);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: 'Server error', code: 'INTERNAL_ERROR' },
        }),
        { status: 500 },
      ),
    );

    const { result } = renderHook(() => useClassifySubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ text: 'test' }),
      ).rejects.toThrow();
    });
  });

  it('starts in idle state before mutation is called', () => {
    const { result } = renderHook(() => useClassifySubject(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
