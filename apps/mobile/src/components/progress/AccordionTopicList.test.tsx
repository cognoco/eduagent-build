import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  cleanupScreen,
} from '../../../test-utils/screen-render-harness';
import { AccordionTopicList } from './AccordionTopicList';

// ─── Transport boundary ───────────────────────────────────────────────────────
// Mock only the fetch layer — real hooks + QueryClient execute as production code.

const mockFetch = createRoutedMockFetch();

jest.mock('../../lib/api-client', () => // gc1-allow: transport-boundary — mocks fetch layer only, real hooks execute
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

// ─── expo-router  (native-boundary) ──────────────────────────────────────────

const mockPush = jest.fn();
let mockSegments: string[] = ['(app)', 'child', '[profileId]'];

jest.mock('expo-router', () => ({ // gc1-allow: native-boundary — expo-router requires native navigation stack unavailable in Jest
  useRouter: () => ({ push: mockPush }),
  useSegments: () => mockSegments,
}));

// ─── Shared topic fixtures ────────────────────────────────────────────────────

const TOPIC_FRACTIONS = {
  topicId: 'topic-1',
  title: 'Fractions',
  description: 'Desc',
  completionStatus: 'in_progress',
  retentionStatus: 'fading',
  struggleStatus: 'normal',
  masteryScore: 0.4,
  summaryExcerpt: null,
  xpStatus: 'pending',
  totalSessions: 3,
};

const TOPIC_GEOMETRY = {
  topicId: 'topic-2',
  title: 'Geometry',
  description: 'Desc',
  completionStatus: 'completed',
  retentionStatus: null,
  struggleStatus: 'normal',
  masteryScore: 0.8,
  summaryExcerpt: null,
  xpStatus: 'verified',
  totalSessions: 2,
};

const TOPIC_DECIMALS = {
  topicId: 'topic-3',
  title: 'Decimals',
  description: 'Desc',
  completionStatus: 'completed',
  retentionStatus: null,
  struggleStatus: 'normal',
  masteryScore: 0.7,
  summaryExcerpt: null,
  xpStatus: 'pending',
  totalSessions: 1,
};

const TOPIC_ALGEBRA = {
  topicId: 'topic-4',
  title: 'Algebra',
  description: 'Desc',
  completionStatus: 'completed',
  retentionStatus: 'weak',
  struggleStatus: 'normal',
  masteryScore: 0.7,
  summaryExcerpt: null,
  xpStatus: 'decayed',
  totalSessions: 4,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AccordionTopicList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = ['(app)', 'child', '[profileId]'];
    mockFetch.setRoute('/dashboard/children/child-1/subjects/subject-1', {
      topics: [],
    });
  });

  it('does not render content while collapsed and keeps the query disabled', () => {
    const { wrapper, queryClient } = createScreenWrapper();
    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded={false}
      />,
      { wrapper },
    );

    expect(screen.queryByText('No topics yet')).toBeNull();
    // No fetch should fire — the query is disabled when expanded=false (both IDs are undefined).
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/dashboard/children'),
      expect.anything(),
    );

    cleanupScreen(queryClient);
  });

  it('renders skeleton rows while loading after expansion', async () => {
    mockFetch.setRoute(
      '/dashboard/children/child-1/subjects/subject-1',
      () => new Promise(() => {}), // never resolves — keeps isLoading=true
    );

    const { wrapper, queryClient } = createScreenWrapper();
    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
      { wrapper },
    );

    expect(screen.getAllByTestId('accordion-topic-skeleton')).toHaveLength(3);
    await cleanupScreen(queryClient);
  });

  it('shows a retry state when topic loading fails', async () => {
    mockFetch.setRoute(
      '/dashboard/children/child-1/subjects/subject-1',
      new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    );

    const { wrapper, queryClient } = createScreenWrapper();
    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
      { wrapper },
    );

    await waitFor(() =>
      screen.getByTestId('accordion-topics-retry'),
    );

    expect(
      screen.getByText(
        'Could not load topics. Tap to retry, or close the subject card to dismiss.',
      ),
    ).toBeTruthy();

    // Pressing retry fires a refetch — the mock fetch is called again.
    fireEvent.press(screen.getByTestId('accordion-topics-retry'));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dashboard/children/child-1/subjects/subject-1'),
        expect.anything(),
      ),
    );

    cleanupScreen(queryClient);
  });

  it('renders topic labels and navigates to topic details', async () => {
    mockFetch.setRoute('/dashboard/children/child-1/subjects/subject-1', {
      topics: [TOPIC_FRACTIONS, TOPIC_GEOMETRY, TOPIC_DECIMALS, TOPIC_ALGEBRA],
    });

    const { wrapper, queryClient } = createScreenWrapper();
    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
      { wrapper },
    );

    await waitFor(() => screen.getByText('Fractions'));

    screen.getByText('Started');
    screen.getByText('Mastered');
    screen.getByText('Covered');
    screen.getByText('Needs review');
    screen.getByTestId('retention-signal-fading');

    fireEvent.press(screen.getByTestId('accordion-topic-topic-1'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/child/[profileId]/topic/[topicId]',
        params: expect.objectContaining({
          profileId: 'child-1',
          subjectId: 'subject-1',
          subjectName: 'Mathematics',
          topicId: 'topic-1',
          totalSessions: '3',
        }),
      }),
    );

    cleanupScreen(queryClient);
  });

  it('renders an empty state when no topics are available', async () => {
    mockFetch.setRoute('/dashboard/children/child-1/subjects/subject-1', {
      topics: [],
    });

    const { wrapper, queryClient } = createScreenWrapper();
    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
      { wrapper },
    );

    await waitFor(() => screen.getByText('No topics yet'));
    cleanupScreen(queryClient);
  });

  it('[UX-DE-M5] empty state shows Browse topics CTA that navigates to library', async () => {
    mockFetch.setRoute('/dashboard/children/child-1/subjects/subject-1', {
      topics: [],
    });

    const { wrapper, queryClient } = createScreenWrapper();
    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
      { wrapper },
    );

    await waitFor(() => screen.getByTestId('accordion-topics-empty'));
    screen.getByTestId('accordion-topics-browse');

    fireEvent.press(screen.getByTestId('accordion-topics-browse'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/library');
    cleanupScreen(queryClient);
  });

  it('[MOBILE-1 F2] pushes parent chain when rendered outside the child stack', async () => {
    mockSegments = ['(app)', 'progress'];
    mockFetch.setRoute('/dashboard/children/child-1/subjects/subject-1', {
      topics: [
        {
          topicId: 'topic-1',
          title: 'Fractions',
          description: 'Desc',
          completionStatus: 'in_progress',
          retentionStatus: null,
          struggleStatus: 'normal',
          masteryScore: 0.5,
          summaryExcerpt: null,
          xpStatus: 'pending',
          totalSessions: 2,
        },
      ],
    });

    const { wrapper, queryClient } = createScreenWrapper();
    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
      { wrapper },
    );

    await waitFor(() => screen.getByTestId('accordion-topic-topic-1'));
    fireEvent.press(screen.getByTestId('accordion-topic-topic-1'));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenNthCalledWith(1, {
      pathname: '/(app)/child/[profileId]',
      params: { profileId: 'child-1' },
    });
    expect(mockPush).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        pathname: '/(app)/child/[profileId]/topic/[topicId]',
        params: expect.objectContaining({
          profileId: 'child-1',
          topicId: 'topic-1',
        }),
      }),
    );

    cleanupScreen(queryClient);
  });

  it('[MOBILE-1 F2] does not double-push when already inside the child stack', async () => {
    mockSegments = ['(app)', 'child', '[profileId]'];
    mockFetch.setRoute('/dashboard/children/child-1/subjects/subject-1', {
      topics: [
        {
          topicId: 'topic-1',
          title: 'Fractions',
          description: 'Desc',
          completionStatus: 'in_progress',
          retentionStatus: null,
          struggleStatus: 'normal',
          masteryScore: 0.5,
          summaryExcerpt: null,
          xpStatus: 'pending',
          totalSessions: 2,
        },
      ],
    });

    const { wrapper, queryClient } = createScreenWrapper();
    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
      { wrapper },
    );

    await waitFor(() => screen.getByTestId('accordion-topic-topic-1'));
    fireEvent.press(screen.getByTestId('accordion-topic-topic-1'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/child/[profileId]/topic/[topicId]',
      }),
    );

    cleanupScreen(queryClient);
  });
});
