import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConsentCheck, useRequestConsent } from './use-consent';

const mockPost = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ post: mockPost }),
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

describe('useConsentCheck', () => {
  it('returns not required when birthDate is null', () => {
    const { result } = renderHook(() => useConsentCheck(null, 'EU'));
    expect(result.current.required).toBe(false);
    expect(result.current.consentType).toBeNull();
  });

  it('returns not required when location is null', () => {
    const { result } = renderHook(() => useConsentCheck('2015-01-01', null));
    expect(result.current.required).toBe(false);
    expect(result.current.consentType).toBeNull();
  });

  it('returns GDPR required for EU child under 16', () => {
    // A child born 10 years ago
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0];

    const { result } = renderHook(() => useConsentCheck(birthDate, 'EU'));
    expect(result.current.required).toBe(true);
    expect(result.current.consentType).toBe('GDPR');
  });

  it('returns not required for EU adult', () => {
    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
    const birthDate = twentyYearsAgo.toISOString().split('T')[0];

    const { result } = renderHook(() => useConsentCheck(birthDate, 'EU'));
    expect(result.current.required).toBe(false);
    expect(result.current.consentType).toBeNull();
  });

  it('returns COPPA required for US child under 13', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0];

    const { result } = renderHook(() => useConsentCheck(birthDate, 'US'));
    expect(result.current.required).toBe(true);
    expect(result.current.consentType).toBe('COPPA');
  });

  it('returns not required for US child 13 or older', () => {
    const fourteenYearsAgo = new Date();
    fourteenYearsAgo.setFullYear(fourteenYearsAgo.getFullYear() - 14);
    const birthDate = fourteenYearsAgo.toISOString().split('T')[0];

    const { result } = renderHook(() => useConsentCheck(birthDate, 'US'));
    expect(result.current.required).toBe(false);
    expect(result.current.consentType).toBeNull();
  });

  it('returns not required for OTHER location regardless of age', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const birthDate = tenYearsAgo.toISOString().split('T')[0];

    const { result } = renderHook(() => useConsentCheck(birthDate, 'OTHER'));
    expect(result.current.required).toBe(false);
    expect(result.current.consentType).toBeNull();
  });
});

describe('useRequestConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('calls POST /consent/request with input', async () => {
    mockPost.mockResolvedValue({
      message: 'Consent request sent to parent',
      consentType: 'GDPR',
    });

    const { result } = renderHook(() => useRequestConsent(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      childProfileId: '550e8400-e29b-41d4-a716-446655440000',
      parentEmail: 'parent@example.com',
      consentType: 'GDPR',
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/consent/request', {
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      });
    });
  });
});
