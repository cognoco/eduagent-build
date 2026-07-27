import { fireEvent } from '@testing-library/react-native';
import {
  renderScreen,
  createTestProfile,
  type RenderScreenResult,
} from '../../test-utils/screen-render';
import { VerifiedProofCard } from './VerifiedProofCard';

jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — returns en.json strings */,
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockPush = jest.fn();
jest.mock(
  'expo-router' /* gc1-allow: expo-router requires a native navigation container not available in JSDOM */,
  () => ({
    router: { push: mockPush },
    useRouter: () => ({ push: mockPush }),
  }),
);

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const PARENT_ID = '10000000-0000-4000-8000-000000000002';
const CHILD_PROFILE_ID = '10000000-0000-4000-8000-0000000000a1';
const SESSION_ID = '10000000-0000-4000-8000-0000000000b1';

// canAccessFamilyChildData (use-dashboard.ts) requires an owner profile WITH
// at least one linked child in `profiles` — a childless solo-owner resolves
// to study mode and the query never fires. Mirrors ParentHomeScreen.test.tsx's
// PARENT/CHILD_A fixtures.
const PARENT = createTestProfile({
  id: PARENT_ID,
  accountId: ACCOUNT_ID,
  displayName: 'Alex Parent',
  isOwner: true,
  birthYear: 1985,
});
const CHILD = createTestProfile({
  id: CHILD_PROFILE_ID,
  accountId: ACCOUNT_ID,
  displayName: 'Emma',
  isOwner: false,
  birthYear: 2012,
});

describe('VerifiedProofCard', () => {
  let active: RenderScreenResult | null = null;

  afterEach(() => {
    mockPush.mockClear();
    if (active) {
      active.cleanup();
      active = null;
    }
  });

  it('renders nothing when hasProof is false (empty state)', () => {
    active = renderScreen(
      <VerifiedProofCard
        childProfileId={CHILD_PROFILE_ID}
        accentColor="#123456"
      />,
      {
        profile: PARENT,
        profiles: [PARENT, CHILD],
        routes: { '/verified-proof': { hasProof: false, quote: null } },
      },
    );

    expect(
      active.result.queryByTestId(
        `parent-home-child-verified-proof-${CHILD_PROFILE_ID}`,
      ),
    ).toBeNull();
  });

  it('renders lookup unavailable when the verified-proof request fails', async () => {
    active = renderScreen(
      <VerifiedProofCard
        childProfileId={CHILD_PROFILE_ID}
        accentColor="#123456"
      />,
      {
        profile: PARENT,
        profiles: [PARENT, CHILD],
        routes: {
          '/verified-proof': () =>
            new Response(JSON.stringify({ message: 'database query detail' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
        },
      },
    );

    await active.result.findByTestId(
      `parent-home-child-verified-proof-unavailable-${CHILD_PROFILE_ID}`,
    );
    expect(
      active.result.queryByTestId(
        `parent-home-child-verified-proof-${CHILD_PROFILE_ID}`,
      ),
    ).toBeNull();
    expect(active.result.queryByText(/database|query|detail/i)).toBeNull();
  });

  it('renders topic/date/quote when a verified proof exists', async () => {
    active = renderScreen(
      <VerifiedProofCard
        childProfileId={CHILD_PROFILE_ID}
        accentColor="#123456"
      />,
      {
        profile: PARENT,
        profiles: [PARENT, CHILD],
        routes: {
          '/verified-proof': {
            hasProof: true,
            topicId: '10000000-0000-4000-8000-0000000000c1',
            topicTitle: 'Photosynthesis',
            subjectId: '10000000-0000-4000-8000-0000000000d1',
            sessionId: SESSION_ID,
            verifiedAt: '2026-07-01T12:00:00.000Z',
            quote: 'Plants convert light into chemical energy.',
            evidenceAvailability: 'available',
            masteryVerificationState: 'fresh',
            retentionStatus: 'strong',
          },
        },
      },
    );

    await active.result.findByTestId(
      `parent-home-child-verified-proof-${CHILD_PROFILE_ID}`,
    );
    active.result.getByText(/Photosynthesis/);
    active.result.getByText(/Plants convert light into chemical energy\./);
  });

  // [WI-1658] Regression: masteryVerificationState and retentionStatus are
  // independent axes. A 'stale' verification with NO retention_cards row
  // (retentionStatus absent — a real API output shape) must still render
  // its 'stale' qualifier — never suppressed just because retention data is
  // missing, which would render an unqualified "verified" claim in effect.
  it('renders the stale qualifier even when retentionStatus is absent', async () => {
    active = renderScreen(
      <VerifiedProofCard
        childProfileId={CHILD_PROFILE_ID}
        accentColor="#123456"
      />,
      {
        profile: PARENT,
        profiles: [PARENT, CHILD],
        routes: {
          '/verified-proof': {
            hasProof: true,
            topicId: '10000000-0000-4000-8000-0000000000c1',
            topicTitle: 'Photosynthesis',
            subjectId: '10000000-0000-4000-8000-0000000000d1',
            sessionId: SESSION_ID,
            verifiedAt: '2026-07-01T12:00:00.000Z',
            quote: 'Plants convert light into chemical energy.',
            evidenceAvailability: 'available',
            masteryVerificationState: 'stale',
            // retentionStatus intentionally omitted.
          },
        },
      },
    );

    await active.result.findByTestId(
      `parent-home-child-verified-proof-${CHILD_PROFILE_ID}`,
    );
    active.result.getByText(/Worth another look/);
  });

  it('renders the degradation line when quote is null', async () => {
    active = renderScreen(
      <VerifiedProofCard
        childProfileId={CHILD_PROFILE_ID}
        accentColor="#123456"
      />,
      {
        profile: PARENT,
        profiles: [PARENT, CHILD],
        routes: {
          '/verified-proof': {
            hasProof: true,
            topicId: '10000000-0000-4000-8000-0000000000c1',
            topicTitle: 'Photosynthesis',
            subjectId: '10000000-0000-4000-8000-0000000000d1',
            sessionId: SESSION_ID,
            verifiedAt: '2026-07-01T12:00:00.000Z',
            quote: null,
            evidenceAvailability: 'source_unavailable',
            masteryVerificationState: 'fresh',
            retentionStatus: 'strong',
          },
        },
      },
    );

    await active.result.findByTestId(
      `parent-home-child-verified-proof-${CHILD_PROFILE_ID}`,
    );
    active.result.getByText(/Source no longer available/);
    expect(active.result.queryByText(/Plants convert light/)).toBeNull();
  });

  it('never renders when the payload omits sessionId or topicTitle (defensive)', () => {
    active = renderScreen(
      <VerifiedProofCard
        childProfileId={CHILD_PROFILE_ID}
        accentColor="#123456"
      />,
      {
        profile: PARENT,
        profiles: [PARENT, CHILD],
        routes: {
          // hasProof:true but missing required fields for a real receipt —
          // the card must not render a broken/partial claim.
          '/verified-proof': { hasProof: true, quote: null },
        },
      },
    );

    expect(
      active.result.queryByTestId(
        `parent-home-child-verified-proof-${CHILD_PROFILE_ID}`,
      ),
    ).toBeNull();
  });

  it('tap navigates to the child session detail with a family-home return target', async () => {
    active = renderScreen(
      <VerifiedProofCard
        childProfileId={CHILD_PROFILE_ID}
        accentColor="#123456"
      />,
      {
        profile: PARENT,
        profiles: [PARENT, CHILD],
        routes: {
          '/verified-proof': {
            hasProof: true,
            topicId: '10000000-0000-4000-8000-0000000000c1',
            topicTitle: 'Photosynthesis',
            subjectId: '10000000-0000-4000-8000-0000000000d1',
            sessionId: SESSION_ID,
            verifiedAt: '2026-07-01T12:00:00.000Z',
            quote: 'Plants convert light into chemical energy.',
            evidenceAvailability: 'available',
            masteryVerificationState: 'fresh',
            retentionStatus: 'strong',
          },
        },
      },
    );

    const card = await active.result.findByTestId(
      `parent-home-child-verified-proof-${CHILD_PROFILE_ID}`,
    );
    fireEvent.press(card);

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/child/[profileId]/session/[sessionId]',
        params: expect.objectContaining({
          profileId: CHILD_PROFILE_ID,
          sessionId: SESSION_ID,
          returnTo: 'family-home',
        }),
      }),
    );
  });
});
