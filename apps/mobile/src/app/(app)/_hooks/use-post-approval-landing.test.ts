/**
 * [ACCOUNT-24] WI-871 — post-approval landing gate (`usePostApprovalLanding`).
 *
 * Deterministic coverage for the "once per profile" celebration that shows
 * after a parent approves consent. The flow-revision sweep could only
 * source-check the audience/suppression discriminators; this locks them:
 *   - shows for a newly-consented CHILD with no subjects yet
 *   - shows for a teen-OWNER who went through a parental-consent flow
 *     (parentEmail set ⇒ hadParentalConsentFlow) — BUG-61
 *   - suppressed for an OWNER with no parental-consent flow (adult owner)
 *   - suppressed for an impersonating parent (role !== child/owner) — BUG-914
 *   - suppressed once SecureStore records the profile already saw it (per-profile key)
 *   - suppressed when the profile already has subjects (returning user, not first run)
 *   - dismiss() persists the per-profile SecureStore flag
 *
 * Mocked boundary: `lib/secure-storage` (Expo SecureStore — native, cannot run
 * in jsdom). The consent-status + subjects reads run as REAL hooks against a
 * routed mock fetch — no internal hook/service mock, no mailbox/SMTP.
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createScreenWrapper,
  createTestProfile,
  createRoutedMockFetch,
  type RoutedMockFetch,
} from '../../../test-utils/screen-render';
import type { Profile } from '../../../lib/profile';
import type { ActiveProfileRole } from '../../../hooks/use-active-profile-role';

import { usePostApprovalLanding } from './use-post-approval-landing';

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();
// Only the two native async SecureStore calls are stubbed; the rest of the
// module (sanitizeSecureStoreKey etc., used by profile.ts) stays real.
jest.mock(
  '../../../lib/secure-storage' /* gc1-allow: native-boundary — Expo SecureStore getItemAsync/setItemAsync cannot run in jsdom */,
  () => {
    const actual = jest.requireActual('../../../lib/secure-storage');
    return {
      ...actual,
      getItemAsync: (key: string) => mockGetItem(key),
      setItemAsync: (key: string, value: string) => mockSetItem(key, value),
    };
  },
);

const CHILD_ID = 'profile-child-1';

let mockFetch: RoutedMockFetch;
let queryClient: QueryClient;
let prevFetch: typeof globalThis.fetch;

/** my-status drives `hadParentalConsentFlow` (true when parentEmail set). */
function myStatus(parentEmail: string | null) {
  return () => ({
    consentStatus: 'CONSENTED',
    parentEmail,
    consentType: 'GDPR',
  });
}

function subjectsRoute(list: unknown[]) {
  // useSubjects reads `data.subjects` off the response envelope.
  return () => ({ subjects: list });
}

function makeWrapper(activeProfile: Profile) {
  const w = createScreenWrapper({
    activeProfile,
    profiles: [activeProfile],
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

function childProfile(): Profile {
  return createTestProfile({
    id: CHILD_ID,
    accountId: 'account-family',
    displayName: 'Emma',
    isOwner: false,
    birthYear: 2014,
    consentStatus: 'CONSENTED',
  });
}

beforeEach(() => {
  prevFetch = globalThis.fetch;
  mockFetch = createRoutedMockFetch();
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    mockFetch as unknown as typeof fetch;
  // Default: never seen before.
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
});

afterEach(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = prevFetch;
  queryClient?.clear();
  jest.clearAllMocks();
});

function render(
  consentStatus: string | null,
  role: ActiveProfileRole | null,
  routes: Record<string, unknown>,
) {
  mockFetch.setRoute('/consent/my-status', routes['/consent/my-status']);
  mockFetch.setRoute('/subjects', routes['/subjects']);
  return renderHook(
    () => usePostApprovalLanding(CHILD_ID, consentStatus, role),
    { wrapper: makeWrapper(childProfile()) },
  );
}

describe('usePostApprovalLanding [ACCOUNT-24]', () => {
  it('shows for a newly-consented child with no subjects', async () => {
    const { result } = render('CONSENTED', 'child', {
      '/consent/my-status': myStatus('parent@example.com'),
      '/subjects': subjectsRoute([]),
    });

    await waitFor(() => expect(result.current[0]).toBe(true));
  });

  it('[BUG-61] shows for a teen-owner who went through a parental-consent flow', async () => {
    const { result } = render('CONSENTED', 'owner', {
      // parentEmail set ⇒ hadParentalConsentFlow ⇒ owner is the audience
      '/consent/my-status': myStatus('parent@example.com'),
      '/subjects': subjectsRoute([]),
    });

    await waitFor(() => expect(result.current[0]).toBe(true));
  });

  it('suppresses for an adult owner with NO parental-consent flow (parentEmail null)', async () => {
    const { result } = render('CONSENTED', 'owner', {
      '/consent/my-status': myStatus(null),
      '/subjects': subjectsRoute([]),
    });

    // acceptsPostApproval is false → never shows; give effects a tick.
    await waitFor(() => expect(mockGetItem).not.toHaveBeenCalled());
    expect(result.current[0]).toBe(false);
  });

  it('[BUG-914] suppresses for an impersonating parent (role impersonated-child)', async () => {
    const { result } = render('CONSENTED', 'impersonated-child', {
      '/consent/my-status': myStatus('parent@example.com'),
      '/subjects': subjectsRoute([]),
    });

    await waitFor(() => expect(mockGetItem).not.toHaveBeenCalled());
    expect(result.current[0]).toBe(false);
  });

  it('suppresses when consent is not yet CONSENTED', async () => {
    const { result } = render('PARENTAL_CONSENT_REQUESTED', 'child', {
      '/consent/my-status': myStatus('parent@example.com'),
      '/subjects': subjectsRoute([]),
    });

    await waitFor(() => expect(result.current[0]).toBe(false));
  });

  it('suppresses once SecureStore records the profile already saw the landing', async () => {
    mockGetItem.mockResolvedValue('true');
    const { result } = render('CONSENTED', 'child', {
      '/consent/my-status': myStatus('parent@example.com'),
      '/subjects': subjectsRoute([]),
    });

    await waitFor(() =>
      expect(mockGetItem).toHaveBeenCalledWith(`postApprovalSeen_${CHILD_ID}`),
    );
    expect(result.current[0]).toBe(false);
  });

  it('suppresses when the profile already has subjects (returning user, not first run)', async () => {
    const { result } = render('CONSENTED', 'child', {
      '/consent/my-status': myStatus('parent@example.com'),
      '/subjects': subjectsRoute([
        {
          id: '50000000-0000-4000-8000-000000000011',
          profileId: '50000000-0000-4000-8000-000000000012',
          name: 'Maths',
          status: 'active',
          pedagogyMode: 'socratic',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    });

    // SecureStore says "not seen", but the subjects query (gated on
    // shouldShow) fires and the existing subject vetoes the landing.
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([input]) =>
          String(input).includes('/subjects'),
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(result.current[0]).toBe(false));
  });

  it('dismiss() persists the per-profile SecureStore flag and hides the landing', async () => {
    const { result } = render('CONSENTED', 'child', {
      '/consent/my-status': myStatus('parent@example.com'),
      '/subjects': subjectsRoute([]),
    });

    await waitFor(() => expect(result.current[0]).toBe(true));

    act(() => result.current[1]());

    expect(mockSetItem).toHaveBeenCalledWith(
      `postApprovalSeen_${CHILD_ID}`,
      'true',
    );
    expect(result.current[0]).toBe(false);
  });
});
