import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { ProfileContext, type ProfileContextValue } from '../lib/profile';
import {
  checkConsentRequirement,
  useRequestConsent,
  useResendConsent,
  useChildConsentStatus,
  useRevokeConsent,
} from './use-consent';
// [F-153] useRestoreConsent moved to use-restore-consent (variables-as-arg pattern)
import { useRestoreConsent } from './use-restore-consent';

const CURRENT_YEAR = new Date().getFullYear();

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

function createWrapper(profileId = 'test-profile-id', isOwner = true) {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: profileId, isOwner }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

/**
 * Creates a wrapper that shares an existing QueryClient but uses a different
 * active profile. Used in the [BREAK] cross-account cache isolation test to
 * render two hooks on the same QueryClient with different profile identities.
 */
function createWrapperWithSharedQueryClient(
  sharedQueryClient: QueryClient,
  profileId: string,
  isOwner = true,
) {
  const profile = createTestProfile({ id: profileId, isOwner });
  const profileContextValue: ProfileContextValue = {
    profiles: [profile],
    activeProfile: profile,
    isExplicitProxyMode: false,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: sharedQueryClient },
      createElement(
        ProfileContext.Provider,
        { value: profileContextValue },
        children,
      ),
    );
  }

  return Wrapper;
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

describe('checkConsentRequirement', () => {
  it('returns not required when birthYear is null', () => {
    const result = checkConsentRequirement(null);
    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('returns GDPR required for child under 16', () => {
    const result = checkConsentRequirement(CURRENT_YEAR - 10);
    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
  });

  it('returns GDPR required for 15-year-old (boundary)', () => {
    const result = checkConsentRequirement(CURRENT_YEAR - 15);
    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
  });

  it('returns GDPR required for 16-year-old with the conservative birth-year rule', () => {
    const result = checkConsentRequirement(CURRENT_YEAR - 16);
    expect(result.required).toBe(true);
    expect(result.consentType).toBe('GDPR');
  });

  it('returns not required once the learner is clearly over the threshold', () => {
    const result = checkConsentRequirement(CURRENT_YEAR - 17);
    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });

  it('returns not required for adults', () => {
    const result = checkConsentRequirement(CURRENT_YEAR - 20);
    expect(result.required).toBe(false);
    expect(result.consentType).toBeNull();
  });
});

describe('useRequestConsent', () => {
  it('calls POST /consent/request with input', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Consent request sent to parent',
          consentType: 'GDPR',
          emailStatus: 'sent',
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useRequestConsent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      });
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useResendConsent [WI-374]', () => {
  // Extract { url, body } from a fetch mock call regardless of whether the RPC
  // client passes (url, init) or a Request object. [CodeRabbit] When the first
  // arg is a Request, the payload may live on the Request itself (not init.body),
  // so read the Request body too — otherwise the "no parentEmail leaked"
  // assertion could pass vacuously.
  async function readFetchCall(
    call: unknown[],
  ): Promise<{ url: string; body: string }> {
    const first = call[0];
    const init = call[1] as RequestInit | undefined;
    const initBody = String(init?.body ?? '');
    if (typeof first === 'string') {
      return { url: first, body: initBody };
    }
    if (first instanceof URL) {
      return { url: first.toString(), body: initBody };
    }
    const req = first as Request;
    let reqBody = '';
    try {
      reqBody = await req.clone().text();
    } catch {
      // body already consumed or not readable — fall back to init.body
    }
    return { url: req.url, body: reqBody || initBody };
  }

  it('[WI-261] POSTs /consent/resend with NO parentEmail (masked email can never be sent)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Consent request sent to parent',
          consentType: 'GDPR',
          emailStatus: 'sent',
        }),
        { status: 201 },
      ),
    );

    const { result } = renderHook(() => useResendConsent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        consentType: 'GDPR',
      });
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const { url, body } = await readFetchCall(mockFetch.mock.calls[0]!);
    expect(url).toContain('/consent/resend');
    expect(body).not.toContain('parentEmail');
    expect(body).toContain('550e8400-e29b-41d4-a716-446655440000');
  });

  it('type rejects passing a parentEmail on resend', () => {
    const { result } = renderHook(() => useResendConsent(), {
      wrapper: createWrapper(),
    });
    // Compile-time guard: the resend mutation input has no parentEmail field.
    void (() =>
      result.current.mutate({
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        consentType: 'GDPR',
        // @ts-expect-error parentEmail is not part of the resend input shape
        parentEmail: 'j***@gmail.com',
      }));
    expect(result.current).toBeDefined();
  });
});

describe('useChildConsentStatus', () => {
  it('fetches consent status for a child profile', async () => {
    const statusData = {
      consentStatus: 'CONSENTED',
      respondedAt: '2025-01-15T10:00:00.000Z',
      consentType: 'GDPR',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(statusData), { status: 200 }),
    );

    const childId = '550e8400-e29b-41d4-a716-446655440000';
    const { result } = renderHook(() => useChildConsentStatus(childId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.consentStatus).toBe('CONSENTED');
    expect(result.current.data?.respondedAt).toBe('2025-01-15T10:00:00.000Z');
    expect(result.current.data?.consentType).toBe('GDPR');
  });

  it('does not fetch when childProfileId is undefined', () => {
    renderHook(() => useChildConsentStatus(undefined), {
      wrapper: createWrapper(),
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // [BREAK] [BUG-164] Without parent identity in the cache key, two
  // different parents on a shared device looking up the same childProfileId
  // would share a cache entry — and parent B could see parent A's
  // consent-status response (or vice versa). The fix includes the active
  // (parent) profile id in the key so caches are partitioned per parent.
  it('[BREAK] does not serve parent A child consent status to parent B (cross-account leak)', async () => {
    const childId = '550e8400-e29b-41d4-a716-446655440000';
    // Create a shared QueryClient so both hooks operate on the same cache.
    const sharedQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    setActiveProfileId('parent-A');
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          consentStatus: 'CONSENTED',
          respondedAt: '2025-01-15T10:00:00.000Z',
          consentType: 'GDPR',
        }),
        { status: 200 },
      ),
    );

    const wrapperA = createWrapperWithSharedQueryClient(
      sharedQueryClient,
      'parent-A',
    );
    const parentA = renderHook(() => useChildConsentStatus(childId), {
      wrapper: wrapperA,
    });

    await waitFor(() => {
      expect(parentA.result.current.isSuccess).toBe(true);
    });
    expect(parentA.result.current.data?.consentStatus).toBe('CONSENTED');

    // Switch to parent B WITHOUT clearing the QueryClient — simulates the
    // shared-device leak window.
    setActiveProfileId('parent-B');
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          consentStatus: 'WITHDRAWN',
          respondedAt: null,
          consentType: 'GDPR',
        }),
        { status: 200 },
      ),
    );

    const wrapperB = createWrapperWithSharedQueryClient(
      sharedQueryClient,
      'parent-B',
    );
    const parentB = renderHook(() => useChildConsentStatus(childId), {
      wrapper: wrapperB,
    });

    await waitFor(() => {
      expect(parentB.result.current.isSuccess).toBe(true);
    });

    // Parent B must get their own fetched data, not parent A's cached one.
    expect(parentB.result.current.data?.consentStatus).toBe('WITHDRAWN');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    sharedQueryClient.clear();
  });
});

describe('useRevokeConsent', () => {
  it('calls PUT /consent/:childProfileId/revoke', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message:
            'Consent revoked. Data will be deleted after 7-day grace period.',
          consentStatus: 'WITHDRAWN',
        }),
        { status: 200 },
      ),
    );

    const childId = '550e8400-e29b-41d4-a716-446655440000';
    const { result } = renderHook(() => useRevokeConsent(childId), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync();
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!.consentStatus).toBe('WITHDRAWN');
  });
});

// [F-153] useRestoreConsent now lives in use-restore-consent.ts and uses the
// variables-as-arg pattern: mutate({ childProfileId }) instead of baking
// the id at hook construction time.
describe('useRestoreConsent (use-restore-consent.ts)', () => {
  it('[BREAK F-153] calls PUT /consent/:childProfileId/restore with childProfileId as mutation variable', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Consent restored. Deletion cancelled.',
          consentStatus: 'CONSENTED',
        }),
        { status: 200 },
      ),
    );

    const childId = '550e8400-e29b-41d4-a716-446655440000';
    // New signature: no argument at construction time; childProfileId is a mutation variable.
    const { result } = renderHook(() => useRestoreConsent(), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      // Variables-as-arg pattern: pass childProfileId here, not at hook call.
      data = await result.current.mutateAsync({ childProfileId: childId });
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!.consentStatus).toBe('CONSENTED');
  });
});
