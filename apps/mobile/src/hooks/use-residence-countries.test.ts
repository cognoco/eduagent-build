import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createHookWrapper } from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useResidenceCountries } from './use-residence-countries';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

const mockGetToken = jest.fn().mockResolvedValue('mock-token');
type MockAuthState = {
  isSignedIn: boolean;
  userId: string | undefined;
  sessionId: string | undefined;
  getToken: typeof mockGetToken;
};
const mockUseAuth = jest.fn<MockAuthState, []>(() => ({
  isSignedIn: true,
  userId: 'user-1',
  sessionId: 'session-1',
  getToken: mockGetToken,
}));
// External boundary (bare specifier) — the real Clerk provider cannot run here.
jest.mock('@clerk/expo', () => ({
  useAuth: () => mockUseAuth(),
}));

let queryClient: QueryClient;

/**
 * NOTE the `activeProfile: null`. That is the point of this suite, not an
 * incidental default: the first surface AC-1 names is signup, where no profile
 * exists yet. Passing a profile here would make every case pass while hiding
 * the only failure mode that actually threatened this hook.
 */
function createWrapper(options?: { signedIn?: boolean }) {
  mockUseAuth.mockReturnValue({
    isSignedIn: options?.signedIn ?? true,
    userId: 'user-1',
    sessionId: 'session-1',
    getToken: mockGetToken,
  });
  const w = createHookWrapper({ activeProfile: null });
  queryClient = w.queryClient;
  return w.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId(undefined);
});

afterEach(() => {
  queryClient?.clear();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useResidenceCountries', () => {
  it('[BREAK][WI-2743] resolves with NO active profile — the signup case', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          countries: [
            { countryCode: 'AT', countryName: 'Austria' },
            { countryCode: 'DE', countryName: 'Germany' },
          ],
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useResidenceCountries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // VERIFIED BY SUBSTITUTION, not asserted: swapping the hook to `useApiQuery`
    // — whose `enabled` ends in `&& !!activeProfile` — makes this case fail with
    // `isSuccess` still false after the waitFor timeout. No error is raised
    // anywhere; the user just gets an empty picker. Note that the signed-out
    // case below passes under BOTH implementations, so this positive case is the
    // only one that discriminates between them.
    expect(result.current.data).toEqual([
      { countryCode: 'AT', countryName: 'Austria' },
      { countryCode: 'DE', countryName: 'Germany' },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain(
      '/profiles/residence-countries',
    );
  });

  it('stays disabled until Clerk reports a signed-in user', () => {
    renderHook(() => useResidenceCountries(), {
      wrapper: createWrapper({ signedIn: false }),
    });

    // The route is authenticated; firing before sign-in would only ever 401.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('surfaces an error rather than an empty list when the body is malformed', async () => {
    // A silently-empty country list is indistinguishable from "no countries are
    // available", which at signup reads as a dead picker. It must fail loudly.
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ countries: [{ countryCode: 'DEU' }] }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useResidenceCountries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
