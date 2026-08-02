import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { createRoutedMockFetch } from '../test-utils/mock-api-routes';
import { useFamilyJoinJourney } from './use-family-join-journey';

const mockFetch = createRoutedMockFetch();

jest.mock(
  '../lib/api-client', // gc1-allow: transport-boundary — real Hono RPC client wired over mockFetch
  () => ({
    ...jest.requireActual('../lib/api-client'),
    useApiClient: () => {
      const { hc } = require('hono/client');
      return hc('http://localhost', { fetch: mockFetch });
    },
  }),
);

const FAMILY_ORG_ID = '11111111-1111-4111-8111-111111111111';

describe('useFamilyJoinJourney', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    mockFetch.mockClear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it('starts or resumes with three explicit learner decisions', async () => {
    mockFetch.setRoute('/family-join/journey', {
      status: 'awaiting_guardian',
      familyOrgId: FAMILY_ORG_ID,
      authorizationForm: 'guardian',
      supportershipAuthority: 'guardian',
      supportershipDecision: 'pending',
      visibilityContract: null,
    });
    const { result } = renderHook(() => useFamilyJoinJourney(), { wrapper });

    await act(async () => {
      await result.current.start.mutateAsync({
        token: 'family-code',
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'decline',
      });
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      token: 'family-code',
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'decline',
    });
  });

  it('redeems one provider handle into authority and completes the guardian step in order', async () => {
    mockFetch.setRoute('/family-join/journey', (url: string) => {
      if (url.includes('/guardian/initiate')) {
        return { authorityToken: 'server-minted-authority-token' };
      }
      return {
        status: 'ready_to_join',
        familyOrgId: FAMILY_ORG_ID,
        authorizationForm: 'joint_child_guardian',
        supportershipAuthority: 'guardian',
        supportershipDecision: 'accept',
        visibilityContract: null,
      };
    });
    const { result } = renderHook(() => useFamilyJoinJourney(), { wrapper });

    await act(async () => {
      await result.current.guardian.mutateAsync({
        token: 'family-code',
        verificationHandle: 'single-use-provider-handle',
        authorizeSupportership: true,
      });
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain(
      '/family-join/journey/guardian/initiate',
    );
    expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toEqual({
      token: 'family-code',
      verificationHandle: 'single-use-provider-handle',
    });
    expect(String(mockFetch.mock.calls[1]?.[0])).toContain(
      '/family-join/journey/guardian/complete',
    );
    expect(JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body))).toEqual({
      token: 'family-code',
      authorityToken: 'server-minted-authority-token',
      authorizeSupportership: true,
    });
  });

  it('invalidates identity, consent, scope, and subscription state after landing the join', async () => {
    for (const key of [
      ['profiles'],
      ['consent-status'],
      ['scopes'],
      ['subscription'],
    ]) {
      queryClient.setQueryData(key, { stale: true });
    }
    mockFetch.setRoute('/family-join/journey', () => {
      return {
        status: 'joined',
        familyOrgId: FAMILY_ORG_ID,
        alreadyMember: false,
        storeCancelNudge: null,
        supportershipAuthority: 'learner',
        supportershipDecision: 'decline',
        visibilityContract: null,
      };
    });
    const { result } = renderHook(() => useFamilyJoinJourney(), { wrapper });

    await act(async () => {
      await result.current.finalize.mutateAsync({ token: 'family-code' });
    });

    for (const key of [
      ['profiles'],
      ['consent-status'],
      ['scopes'],
      ['subscription'],
    ]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it('invalidates joined state when start recovers an already-completed journey', async () => {
    for (const key of [
      ['profiles'],
      ['consent-status'],
      ['scopes'],
      ['subscription'],
    ]) {
      queryClient.setQueryData(key, { stale: true });
    }
    mockFetch.setRoute('/family-join/journey', {
      status: 'joined',
      familyOrgId: FAMILY_ORG_ID,
      alreadyMember: true,
      storeCancelNudge: null,
      supportershipAuthority: 'learner',
      supportershipDecision: 'decline',
      visibilityContract: null,
    });
    const { result } = renderHook(() => useFamilyJoinJourney(), { wrapper });

    await act(async () => {
      await result.current.start.mutateAsync({
        token: 'family-code',
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'decline',
      });
    });

    for (const key of [
      ['profiles'],
      ['consent-status'],
      ['scopes'],
      ['subscription'],
    ]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
