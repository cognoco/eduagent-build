import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  checkConsentRequirement,
  useRequestConsent,
  useChildConsentStatus,
  useRevokeConsent,
  useRestoreConsent,
} from './use-consent';

const CURRENT_YEAR = new Date().getFullYear();

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('calls POST /consent/request with input', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Consent request sent to parent',
          consentType: 'GDPR',
        }),
        { status: 200 }
      )
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

describe('useChildConsentStatus', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('fetches consent status for a child profile', async () => {
    const statusData = {
      consentStatus: 'CONSENTED',
      respondedAt: '2025-01-15T10:00:00.000Z',
      consentType: 'GDPR',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(statusData), { status: 200 })
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
});

describe('useRevokeConsent', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('calls PUT /consent/:childProfileId/revoke', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message:
            'Consent revoked. Data will be deleted after 7-day grace period.',
          consentStatus: 'WITHDRAWN',
        }),
        { status: 200 }
      )
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

describe('useRestoreConsent', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('calls PUT /consent/:childProfileId/restore', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Consent restored. Deletion cancelled.',
          consentStatus: 'CONSENTED',
        }),
        { status: 200 }
      )
    );

    const childId = '550e8400-e29b-41d4-a716-446655440000';
    const { result } = renderHook(() => useRestoreConsent(childId), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync();
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!.consentStatus).toBe('CONSENTED');
  });
});
