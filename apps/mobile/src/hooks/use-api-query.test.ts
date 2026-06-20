import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import { useApiQuery } from './use-api-query';

// Mutable so individual tests can simulate "no active profile".
let mockActiveProfile: { id: string } | null = { id: 'test-profile-id' };

// prettier-ignore
jest.mock('../lib/profile', () => ({ // gc1-allow: hook test needs a controllable active profile without provider setup
  ...jest.requireActual('../lib/profile'),
  useProfile: () => ({ activeProfile: mockActiveProfile }),
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

describe('useApiQuery', () => {
  beforeEach(() => {
    mockActiveProfile = { id: 'test-profile-id' };
    jest.restoreAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns the selected slice of a successful response', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [1, 2, 3] }), { status: 200 }),
      );

    const { result } = renderHook(
      () =>
        useApiQuery<{ items: number[] }, number>({
          queryKey: ['probe', 'success'],
          fetch: (signal) => fetchFn(signal),
          select: (json) => json.items.length,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(3);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // An AbortSignal is threaded through to the fetch closure.
    expect(fetchFn.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });

  it('returns a configured fallback for a 404 without parsing the body', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(new Response('not found', { status: 404 }));
    const select = jest.fn();

    const { result } = renderHook(
      () =>
        useApiQuery<unknown, { shape: 'learner' }>({
          queryKey: ['probe', 'not-found-fallback'],
          fetch: (signal) => fetchFn(signal),
          select,
          notFoundFallback: { shape: 'learner' },
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ shape: 'learner' });
    expect(select).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('propagates an assertOk rejection into the error state', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(new Response('nope', { status: 500 }));

    const { result } = renderHook(
      () =>
        useApiQuery<{ items: number[] }, number[]>({
          queryKey: ['probe', 'error'],
          fetch: (signal) => fetchFn(signal),
          select: (json) => json.items,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    // assertOk classifies the 5xx and attaches the status; the message is the
    // raw body it extracted.
    expect((result.current.error as { status?: number }).status).toBe(500);
    expect((result.current.error as Error).message).toBe('nope');
  });

  it('runs cleanup (clears the timeout) on both success and error', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');

    const okFetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      );
    const okHook = renderHook(
      () =>
        useApiQuery<{ items: number[] }, number[]>({
          queryKey: ['probe', 'cleanup-ok'],
          fetch: (signal) => okFetch(signal),
          select: (json) => json.items,
        }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(okHook.result.current.isSuccess).toBe(true));
    const afterSuccess = clearSpy.mock.calls.length;
    expect(afterSuccess).toBeGreaterThan(0);

    const errFetch = jest
      .fn()
      .mockResolvedValue(new Response('boom', { status: 500 }));
    const errHook = renderHook(
      () =>
        useApiQuery<{ items: number[] }, number[]>({
          queryKey: ['probe', 'cleanup-err'],
          fetch: (signal) => errFetch(signal),
          select: (json) => json.items,
        }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(errHook.result.current.isError).toBe(true));
    expect(clearSpy.mock.calls.length).toBeGreaterThan(afterSuccess);
  });

  it('stays idle when enabled is false', async () => {
    const fetchFn = jest.fn();

    const { result } = renderHook(
      () =>
        useApiQuery({
          queryKey: ['probe', 'disabled'],
          enabled: false,
          fetch: (signal) => fetchFn(signal),
          select: (json) => json,
        }),
      { wrapper: createWrapper() },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stays idle when there is no active profile, even if enabled is true', async () => {
    mockActiveProfile = null;
    const fetchFn = jest.fn();

    const { result } = renderHook(
      () =>
        useApiQuery({
          queryKey: ['probe', 'no-profile'],
          enabled: true,
          fetch: (signal) => fetchFn(signal),
          select: (json) => json,
        }),
      { wrapper: createWrapper() },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
