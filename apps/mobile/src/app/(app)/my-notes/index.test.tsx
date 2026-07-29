import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoutedMockFetch } from '../../../test-utils/mock-api-routes';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

const mockFetch = createRoutedMockFetch({
  '/progress/sessions': { sessions: [], nextCursor: null },
});
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockReturnTo: string | undefined;

jest.mock(
  '../../../lib/api-client' /* gc1-allow: screen test drives production hooks through the fetch boundary */,
  () =>
    require('../../../test-utils/mock-api-routes').mockApiClientFactory(
      mockFetch,
    ),
);

jest.mock(
  '../../../lib/profile' /* gc1-allow: screen test isolates profile context */,
  () => ({
    ...jest.requireActual('../../../lib/profile'),
    useProfile: () => ({
      activeProfile: {
        id: 'a0000000-0000-4000-a000-000000000001',
        accountId: 'account-1',
        displayName: 'Zuzana',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: null,
      },
    }),
  }),
);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ returnTo: mockReturnTo }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => false,
  }),
}));

let mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const MyNotesHubScreen = require('./index').default;

describe('MyNotesHubScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.setRoute('/progress/sessions', {
      sessions: [],
      nextCursor: null,
    });
    mockReturnTo = undefined;
    mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  });

  it('shows the three archive doors and opens a selected list', () => {
    render(<MyNotesHubScreen />, { wrapper: createWrapper() });

    screen.getByText('Sessions');
    screen.getByText('Notes');
    screen.getByText('Bookmarks');

    fireEvent.press(screen.getByTestId('my-notes-notes'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/my-notes/[kind]',
      params: { kind: 'notes', returnTo: 'own-learning' },
    });
  });

  it('returns to own learner home by default', () => {
    render(<MyNotesHubScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('my-notes-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/own-learning');
  });

  it('honors an explicit learner home return target', () => {
    mockReturnTo = 'learner-home';
    render(<MyNotesHubScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('my-notes-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('shows the sessions count pill once sessions load', async () => {
    mockFetch.setRoute('/progress/sessions', {
      sessions: [
        {
          sessionId: 'a0000000-0000-4000-a000-000000000030',
          subjectId: 'a0000000-0000-4000-a000-000000000010',
          subjectName: 'Chemistry',
          topicId: 'a0000000-0000-4000-a000-000000000020',
          topicTitle: 'Chemical Bonds',
          sessionType: 'learning',
          startedAt: '2026-05-15T10:00:00.000Z',
          endedAt: '2026-05-15T10:04:00.000Z',
          exchangeCount: 4,
          escalationRung: 1,
          durationSeconds: 120,
          wallClockSeconds: 240,
          displayTitle: 'Learning',
          displaySummary: 'Covalent bonds clicked.',
          homeworkSummary: null,
          highlight: 'Covalent bonds clicked.',
          narrative: null,
          conversationPrompt: null,
          engagementSignal: null,
          drills: [],
        },
      ],
    });
    render(<MyNotesHubScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('1'));
  });

  it('shows that the sessions count is loading instead of hiding it', () => {
    mockFetch.setRoute(
      '/progress/sessions',
      () => new Promise(() => undefined),
    );

    render(<MyNotesHubScreen />, { wrapper: createWrapper() });

    screen.getByTestId('my-notes-sessions-count');
    screen.getByText('Loading');
  });

  it('shows when the sessions count is unavailable', async () => {
    mockFetch.setRoute(
      '/progress/sessions',
      new Response(JSON.stringify({ message: 'Unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<MyNotesHubScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      screen.getByText('Unavailable');
    });
  });

  it('navigates to sessions, notes, and bookmarks list from hub', () => {
    render(<MyNotesHubScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('my-notes-sessions'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/my-notes/[kind]',
      params: { kind: 'sessions', returnTo: 'own-learning' },
    });
    jest.clearAllMocks();

    fireEvent.press(screen.getByTestId('my-notes-bookmarks'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/my-notes/[kind]',
      params: { kind: 'bookmarks', returnTo: 'own-learning' },
    });
  });

  // [WI-2331 rework, F1a] my-notes is multi-origin: Mentor's home screen
  // pushes it plain (owning tab = Mentor), Journal's notes archive
  // (JournalNotesArchive.tsx) pushes it with `returnTo: 'journal'`. Before
  // this fix, the hub's Back LABEL was hard-coded to `V2_TAB_TITLE_KEYS.mentor`
  // even though its Back DESTINATION already honored `returnTo` — a
  // Journal-origin visit showed "Back to Mentor" while actually returning to
  // Journal. The label must be derived from `returnTo` the same way the
  // destination is.
  describe('Back label names the actual returnTo destination under V2 [WI-2331 rework F1a]', () => {
    let originalV2: boolean;

    beforeEach(() => {
      originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        true;
    });

    afterEach(() => {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        originalV2;
    });

    it('labels and routes Back to Journal when returnTo is journal', () => {
      mockReturnTo = 'journal';
      render(<MyNotesHubScreen />, { wrapper: createWrapper() });

      screen.getByLabelText('Back to Journal');

      fireEvent.press(screen.getByTestId('my-notes-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/journal');
    });

    it('labels and routes Back to Mentor for a Mentor-origin visit (returnTo=mentor)', () => {
      mockReturnTo = 'mentor';
      render(<MyNotesHubScreen />, { wrapper: createWrapper() });

      screen.getByLabelText('Back to Mentor');

      fireEvent.press(screen.getByTestId('my-notes-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor');
    });

    // [WI-2331 AC-5] this multi-origin screen's named Back control must
    // remain rendered and usable at a small-phone viewport (modest status
    // bar, no home-indicator gesture area — e.g. iPhone SE-class), not just
    // at the all-zero-inset default the rest of this describe block uses.
    it('keeps the named Back control usable at a small-phone viewport', () => {
      mockSafeAreaInsets = { top: 20, bottom: 0, left: 0, right: 0 };
      mockReturnTo = 'journal';
      render(<MyNotesHubScreen />, { wrapper: createWrapper() });

      screen.getByLabelText('Back to Journal');

      fireEvent.press(screen.getByTestId('my-notes-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/journal');
    });
  });
});
