import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  checkConsentRequirement,
  useRequestConsent,
  useChildConsentStatus,
  useRevokeConsent,
  useRestoreConsent,
} from './use-consent';

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
  it('returns not required when birthDate is null', () => {
    const { result } = renderHook(() => checkConsentRequirement(null));
    expect(result.current.required).toBe(false);
    expect(result.current.consentType).toBeNull();
  });

  it('returns GDPR required for child under 16', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0]!;

    const { result } = renderHook(() => checkConsentRequirement(birthDate));
    expect(result.current.required).toBe(true);
    expect(result.current.consentType).toBe('GDPR');
  });

  it('returns GDPR required for 15-year-old (boundary)', () => {
    const fifteenYearsAgo = new Date();
    fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);
    const birthDate = fifteenYearsAgo.toISOString().split('T')[0]!;

    const { result } = renderHook(() => checkConsentRequirement(birthDate));
    expect(result.current.required).toBe(true);
    expect(result.current.consentType).toBe('GDPR');
  });

  it('returns not required for 16-year-old (boundary)', () => {
    const sixteenYearsAgo = new Date();
    sixteenYearsAgo.setFullYear(sixteenYearsAgo.getFullYear() - 16);
    sixteenYearsAgo.setDate(sixteenYearsAgo.getDate() - 1);
    const birthDate = sixteenYearsAgo.toISOString().split('T')[0]!;

    const { result } = renderHook(() => checkConsentRequirement(birthDate));
    expect(result.current.required).toBe(false);
    expect(result.current.consentType).toBeNull();
  });

  it('returns not required for adult', () => {
    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
    const birthDate = twentyYearsAgo.toISOString().split('T')[0]!;

    const { result } = renderHook(() => checkConsentRequirement(birthDate));
    expect(result.current.required).toBe(false);
    expect(result.current.consentType).toBeNull();
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

    await result.current.mutateAsync({
      childProfileId: '550e8400-e29b-41d4-a716-446655440000',
      parentEmail: 'parent@example.com',
      consentType: 'GDPR',
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
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

    const data = await result.current.mutateAsync();

    expect(mockFetch).toHaveBeenCalled();
    expect(data.consentStatus).toBe('WITHDRAWN');
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

    const data = await result.current.mutateAsync();

    expect(mockFetch).toHaveBeenCalled();
    expect(data.consentStatus).toBe('CONSENTED');
  });
});
