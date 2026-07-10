import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  createRoutedMockFetch,
  type RoutedMockFetch,
} from '../../../../../test-utils/mock-api-routes';
import {
  renderScreen,
  NAMED_PROFILES,
} from '../../../../../test-utils/screen-render';

// i18n boundary. Assertions reference raw translation keys via the
// key-passthrough `t`. The real api-client/profile chain (no longer
// hook-mocked) pulls in i18n/index.ts -> i18next.use(initReactI18next), so
// the boundary exports it needs are supplied so init doesn't blow up.
jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — key-passthrough so key assertions stay exact */,
  () => ({
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        if (opts && typeof opts === 'object') {
          return `${key}:${JSON.stringify(opts)}`;
        }
        return key;
      },
    }),
    initReactI18next: { type: '3rdParty', init: () => undefined },
    Trans: ({ children }: { children?: unknown }) => children ?? null,
  }),
);

const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native-boundary */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

// Route the Hono RPC client through our mock fetch so the real
// useChildSubjectTopics / useChildInventory / useProfileSessions hooks run.
const mockFetch: RoutedMockFetch = createRoutedMockFetch();

jest.mock(
  '../../../../../lib/api-client' /* gc1-allow: transport-boundary — routed mock fetch drives real hooks */,
  () => {
    const actual = jest.requireActual('../../../../../lib/api-client');
    const { hc } = require('hono/client');
    return {
      ...actual,
      useApiClient: () => hc('http://localhost', { fetch: mockFetch }),
    };
  },
);

const SubjectTopicsScreen = require('./[subjectId]').default;

// Guardian owner active + linked child (URL profileId child-1) opens the
// family-data gate (legacyMode !== 'study' && activeProfile.isOwner). The URL
// child-1 differs from the viewer id, so useProfileSessions takes the
// /dashboard/children/:profileId/sessions branch.
const guardianProfile = {
  ...NAMED_PROFILES.guardian,
  id: 'parent-001',
  accountId: 'account-family',
  isOwner: true,
};
const linkedChildProfile = {
  ...NAMED_PROFILES.linkedChild,
  id: 'child-1',
  accountId: 'account-family',
  isOwner: false,
};

interface RouteConfig {
  topics?: unknown[];
  inventory?: unknown;
  sessions?: unknown[];
}

function setRoutes(config: RouteConfig = {}): void {
  mockFetch.setRoute('/dashboard/children/child-1/subjects/subject-1', () => ({
    topics: config.topics ?? [],
  }));
  mockFetch.setRoute('/dashboard/children/child-1/inventory', () => ({
    inventory: config.inventory ?? {
      global: { totalSessions: 5 },
      subjects: [],
    },
  }));
  mockFetch.setRoute('/dashboard/children/child-1/sessions', () => ({
    sessions: config.sessions ?? [],
  }));
}

function renderSubjectTopics() {
  return renderScreen(<SubjectTopicsScreen />, {
    profile: guardianProfile,
    profiles: [guardianProfile, linkedChildProfile],
    installGlobalFetch: false,
    routedFetch: mockFetch,
  });
}

describe('SubjectTopicsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockUseLocalSearchParams.mockReturnValue({
      profileId: 'child-1',
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
    });
    setRoutes();
  });

  it('hides the review badge when a topic has no meaningful review data', async () => {
    const topicId = '33333333-3333-4333-8333-333333333333';
    setRoutes({
      topics: [
        {
          topicId,
          title: 'Fractions',
          description: 'Desc',
          completionStatus: 'not_started',
          retentionStatus: 'strong',
          daysSinceLastReview: null,
          struggleStatus: 'normal',
          masteryScore: 0.4,
          summaryExcerpt: null,
          xpStatus: 'pending',
          strongReviews: 0,
          strongReviewsTarget: 3,
          totalSessions: 0,
        },
      ],
    });

    const { cleanup } = renderSubjectTopics();

    await waitFor(() => screen.getByTestId(`topic-card-${topicId}`));
    expect(screen.queryByTestId('retention-signal-strong')).toBeNull();

    cleanup();
  });

  it('passes totalSessions to the topic detail route and shows review data when present', async () => {
    const topicId = '44444444-4444-4444-8444-444444444444';
    setRoutes({
      topics: [
        {
          topicId,
          title: 'Fractions',
          description: 'Desc',
          completionStatus: 'in_progress',
          retentionStatus: 'fading',
          daysSinceLastReview: 4,
          struggleStatus: 'normal',
          masteryScore: 0.4,
          summaryExcerpt: null,
          xpStatus: 'pending',
          strongReviews: 1,
          strongReviewsTarget: 3,
          totalSessions: 3,
        },
      ],
    });

    const { cleanup } = renderSubjectTopics();

    await waitFor(() => screen.getByTestId('retention-signal-fading'));

    fireEvent.press(screen.getByTestId(`topic-card-${topicId}`));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          totalSessions: '3',
        }),
      }),
    );

    cleanup();
  });

  it('shows recent subject sessions when no topics are ready yet', async () => {
    // useProfileSessions runs childSessionsResponseSchema.parse for real, which
    // requires UUIDs for sessionId/subjectId. The subjectId must also equal the
    // URL param so the screen's `subjectSessions` subject filter matches.
    const sessionId = '22222222-2222-7222-8222-222222222222';
    const subjectId = '11111111-1111-7111-8111-111111111111';
    mockUseLocalSearchParams.mockReturnValue({
      profileId: 'child-1',
      subjectId,
      subjectName: 'Mathematics',
    });
    mockFetch.setRoute(
      `/dashboard/children/child-1/subjects/${subjectId}`,
      () => ({
        topics: [],
      }),
    );
    mockFetch.setRoute('/dashboard/children/child-1/sessions', () => ({
      sessions: [
        {
          sessionId,
          subjectId,
          subjectName: 'Mathematics',
          topicId: null,
          topicTitle: null,
          sessionType: 'learning',
          startedAt: '2026-05-13T12:00:00.000Z',
          endedAt: null,
          exchangeCount: 4,
          escalationRung: 1,
          durationSeconds: 600,
          wallClockSeconds: 900,
          displayTitle: 'Learning',
          displaySummary: null,
          homeworkSummary: null,
          highlight: 'Practised number lines.',
          narrative: null,
          conversationPrompt: null,
          engagementSignal: null,
          drills: [],
        },
      ],
    }));

    const { cleanup } = renderSubjectTopics();

    await waitFor(() => screen.getByTestId('subject-recent-sessions'));
    fireEvent.press(screen.getByTestId(`subject-session-card-${sessionId}`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/session/[sessionId]',
      params: {
        profileId: 'child-1',
        sessionId,
      },
    });

    cleanup();
  });
});
