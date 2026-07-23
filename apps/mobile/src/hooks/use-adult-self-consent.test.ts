/**
 * [WI-2547] The adult self-consent acceptance mutation.
 *
 * Pins the three properties the gate depends on:
 *   - it calls ONLY the new self-accept contract (never the mentor-memory
 *     consent route), and sends no caller-supplied identifiers;
 *   - on success it invalidates the user-scoped `profiles` query so the
 *     bootstrap can re-derive `needsAdultConsent`;
 *   - a server failure surfaces as an error rather than a silent success.
 *
 * `fetch` is the external boundary and is the only thing stubbed here.
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';

import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { useAdultSelfConsent } from './use-adult-self-consent';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ACCEPT_OK = {
  message: 'Consent recorded.',
  purposesGranted: ['platform_use', 'llm_disclosure'],
  termsVersion: '2026-05-31',
};

function setup() {
  const wrapper = createHookWrapper({
    activeProfile: createTestProfile({ id: 'adult-owner', isOwner: true }),
  });
  return wrapper;
}

function requestedUrls(): string[] {
  return mockFetch.mock.calls.map((call) => String(call[0]));
}

describe('useAdultSelfConsent [WI-2547]', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs to the self-accept contract with no caller-supplied identifiers', async () => {
    mockFetch.mockResolvedValue(jsonResponse(ACCEPT_OK));
    const { wrapper } = setup();

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.purposesGranted).toEqual([
      'platform_use',
      'llm_disclosure',
    ]);

    const urls = requestedUrls();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/consent/self/accept');

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(String(init?.method).toUpperCase()).toBe('POST');
    // No identifiers are sent: the server derives person/org/basis/version.
    const rawBody = init?.body ? String(init.body) : '';
    expect(rawBody).not.toMatch(
      /personId|profileId|organizationId|lawfulBasis/i,
    );
  });

  it('never touches the mentor-memory consent route', async () => {
    mockFetch.mockResolvedValue(jsonResponse(ACCEPT_OK));
    const { wrapper } = setup();

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    for (const url of requestedUrls()) {
      expect(url).not.toContain('learner-profile/consent');
    }
  });

  it('invalidates the user-scoped profiles query on success', async () => {
    mockFetch.mockResolvedValue(jsonResponse(ACCEPT_OK));
    const { wrapper, queryClient } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['profiles'] }),
    );
  });

  it('accepts an idempotent replay result (no purposes written)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ ...ACCEPT_OK, purposesGranted: [] }),
    );
    const { wrapper } = setup();

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.purposesGranted).toEqual([]);
  });

  it('surfaces a server failure as an error and does not invalidate profiles', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: { message: 'nope' } }, 500),
    );
    const { wrapper, queryClient } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['profiles'] }),
    );
  });

  it('surfaces a fail-closed 403 as an error', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        {
          error: { message: 'This account is not eligible for self-consent.' },
        },
        403,
      ),
    );
    const { wrapper } = setup();

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
