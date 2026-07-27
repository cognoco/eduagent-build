/**
 * [WI-2547] The adult self-consent acceptance mutation.
 *
 * Pins the properties the gate depends on:
 *   - it calls ONLY the new self-accept contract (never the mentor-memory
 *     consent route), and its public variable type is `void` — the caller
 *     chooses and passes no identifier;
 *   - the outgoing request is pinned to the OWNER's profile id even when a
 *     managed child is the restored active profile (the production transport
 *     shape — see below);
 *   - on success it invalidates the user-scoped `profiles` query so the
 *     bootstrap can re-derive `needsAdultConsent`;
 *   - a server failure surfaces as an error rather than a silent success.
 *
 * The shared API client normally carries profile context: it injects the
 * persisted ACTIVE profile as `X-Profile-Id` on any request that did not preset
 * one. These tests drive that REAL behaviour — `setActiveProfileId` publishes
 * into the same module state the client reads, with no internal module mock —
 * so the owner-pinning assertion is made against the actual transport rather
 * than a stub. `fetch` is the external boundary and is the only thing stubbed.
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';

import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useAdultSelfConsent } from './use-adult-self-consent';

const OWNER_ID = 'adult-owner-profile';
const CHILD_ID = 'managed-child-profile';

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

const ownerProfile = createTestProfile({ id: OWNER_ID, isOwner: true });
const childProfile = createTestProfile({
  id: CHILD_ID,
  isOwner: false,
  birthYear: 2014,
});

/** Owner alone is the active profile — the simplest shape. */
function setupOwnerActive() {
  setActiveProfileId(OWNER_ID);
  return createHookWrapper({
    activeProfile: ownerProfile,
    profiles: [ownerProfile],
  });
}

/**
 * The production shape this mutation exists to survive: a guardian whose
 * restored ACTIVE profile is their managed child, while the loaded profile set
 * still contains the adult owner.
 */
function setupChildActive() {
  setActiveProfileId(CHILD_ID);
  return createHookWrapper({
    activeProfile: childProfile,
    profiles: [ownerProfile, childProfile],
  });
}

function requestedUrls(): string[] {
  return mockFetch.mock.calls.map((call) => String(call[0]));
}

/** The `X-Profile-Id` actually put on the wire by the real client. */
function sentProfileHeader(index = 0): string | null {
  const init = mockFetch.mock.calls[index]?.[1] as RequestInit | undefined;
  const headers = init?.headers;
  if (headers instanceof Headers) return headers.get('X-Profile-Id');
  if (Array.isArray(headers)) {
    return (
      headers.find(([k]) => k.toLowerCase() === 'x-profile-id')?.[1] ?? null
    );
  }
  if (headers && typeof headers === 'object') {
    const entry = Object.entries(headers as Record<string, string>).find(
      ([k]) => k.toLowerCase() === 'x-profile-id',
    );
    return entry?.[1] ?? null;
  }
  return null;
}

function sentBody(index = 0): string {
  const init = mockFetch.mock.calls[index]?.[1] as RequestInit | undefined;
  return init?.body ? String(init.body) : '';
}

describe('useAdultSelfConsent [WI-2547]', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    // Module-level identity is global to the api-client module; reset it so
    // this suite is order-independent.
    setActiveProfileId(undefined);
  });

  afterEach(() => {
    setActiveProfileId(undefined);
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs to the self-accept contract with no caller-supplied identifiers', async () => {
    mockFetch.mockResolvedValue(jsonResponse(ACCEPT_OK));
    const { wrapper } = setupOwnerActive();

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      // No variables: the mutation's public type is void.
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
    // The server derives person/org/basis/version; nothing is sent in the body.
    expect(sentBody()).not.toMatch(
      /personId|profileId|organizationId|lawfulBasis|termsVersion/i,
    );
  });

  // The regression this correction exists for. Without the explicit override
  // the shared client would inject the ACTIVE profile (the child), the server
  // would read a header that is not the caller, and its anti-spoof check would
  // 403 an otherwise eligible adult owner — permanently, since the gate would
  // keep re-presenting.
  it('pins X-Profile-Id to the OWNER even when a managed child is the active profile', async () => {
    mockFetch.mockResolvedValue(jsonResponse(ACCEPT_OK));
    const { wrapper } = setupChildActive();

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sentProfileHeader()).toBe(OWNER_ID);
    expect(sentProfileHeader()).not.toBe(CHILD_ID);
    // Still no identifiers in the body — pinning the transport header is not
    // the caller choosing a subject.
    expect(sentBody()).not.toMatch(
      /personId|profileId|organizationId|lawfulBasis|termsVersion/i,
    );
  });

  it('sends the owner header on the plain owner-active shape too', async () => {
    mockFetch.mockResolvedValue(jsonResponse(ACCEPT_OK));
    const { wrapper } = setupOwnerActive();

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sentProfileHeader()).toBe(OWNER_ID);
  });

  it('fails locally without a request when no owner profile can be derived', async () => {
    mockFetch.mockResolvedValue(jsonResponse(ACCEPT_OK));
    setActiveProfileId(CHILD_ID);
    const { wrapper } = createHookWrapper({
      activeProfile: childProfile,
      // No owner in the loaded set.
      profiles: [childProfile],
    });

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Never falls back to the active child — no request is made at all.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never touches the mentor-memory consent route', async () => {
    mockFetch.mockResolvedValue(jsonResponse(ACCEPT_OK));
    const { wrapper } = setupOwnerActive();

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
    const { wrapper, queryClient } = setupOwnerActive();
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
    const { wrapper } = setupOwnerActive();

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
    const { wrapper, queryClient } = setupOwnerActive();
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
    const { wrapper } = setupOwnerActive();

    const { result } = renderHook(() => useAdultSelfConsent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
