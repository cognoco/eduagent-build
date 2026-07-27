import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoutedMockFetch } from '../../../test-utils/mock-api-routes';

const PROFILE_ID = 'a0000000-0000-4000-a000-000000000001';
const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const TOPIC_ID = 'a0000000-0000-4000-a000-000000000020';
const SESSION_ID = 'a0000000-0000-4000-a000-000000000030';
const NOTE_ID = 'a0000000-0000-4000-a000-000000000040';
const BOOKMARK_ID = 'a0000000-0000-4000-a000-000000000050';
const EVENT_ID = 'a0000000-0000-4000-a000-000000000060';
const BOOK_ID = 'a0000000-0000-4000-a000-000000000070';

let mockKind = 'sessions';
let mockReturnTo: string | undefined;
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

const sessionRow = {
  sessionId: SESSION_ID,
  subjectId: SUBJECT_ID,
  subjectName: 'Chemistry',
  topicId: TOPIC_ID,
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
};

const noteRow = {
  id: NOTE_ID,
  topicId: TOPIC_ID,
  topicTitle: 'Chemical Bonds',
  bookId: BOOK_ID,
  bookTitle: 'Chemistry Basics',
  subjectId: SUBJECT_ID,
  subjectName: 'Chemistry',
  sessionId: SESSION_ID,
  content: 'Ionic bonds transfer electrons.',
  artifactSource: 'learner_authored_note',
  verificationState: 'unverified',
  createdAt: '2026-05-14T10:00:00.000Z',
  updatedAt: '2026-05-15T10:00:00.000Z',
};

const bookmarkRow = {
  id: BOOKMARK_ID,
  eventId: EVENT_ID,
  sessionId: SESSION_ID,
  subjectId: SUBJECT_ID,
  topicId: TOPIC_ID,
  subjectName: 'Chemistry',
  topicTitle: 'Chemical Bonds',
  content: 'A covalent bond shares electrons.',
  artifactSource: 'freeform_keep',
  verificationState: 'unverified',
  createdAt: '2026-05-13T10:00:00.000Z',
};

const mockFetch = createRoutedMockFetch({
  '/progress/sessions': { sessions: [sessionRow], nextCursor: null },
  '/notes': { notes: [noteRow], nextCursor: null },
  '/bookmarks': { bookmarks: [bookmarkRow], nextCursor: null },
});

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
        id: PROFILE_ID,
        accountId: 'account-1',
        displayName: 'Zuzana',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: null,
      },
      profiles: [{ id: PROFILE_ID, isOwner: true }],
    }),
  }),
);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ kind: mockKind, returnTo: mockReturnTo }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => false,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

const MyNotesListScreen = require('./[kind]').default;

describe('MyNotesListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKind = 'sessions';
    mockReturnTo = undefined;
    mockFetch.setRoute('/progress/sessions', {
      sessions: [sessionRow],
      nextCursor: null,
    });
    mockFetch.setRoute('/notes', { notes: [noteRow], nextCursor: null });
    mockFetch.setRoute('/bookmarks', {
      bookmarks: [bookmarkRow],
      nextCursor: null,
    });
  });

  it('renders sessions with context and opens the session summary', async () => {
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('Chemistry'));
    screen.getByText('Covalent bonds clicked.');
    screen.getByText('4 min');

    fireEvent.press(screen.getByTestId(`my-notes-row-sessions-${SESSION_ID}`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: { sessionId: SESSION_ID },
    });
  });

  it('switches grouping and filters with search', async () => {
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('Chemistry'));

    fireEvent.press(screen.getByTestId('my-notes-group-subject'));
    screen.getAllByText('Chemistry');

    fireEvent.changeText(screen.getByTestId('my-notes-search'), 'history');
    await waitFor(() => screen.getByTestId('my-notes-empty'));
    screen.getByText('No sessions yet');
  });

  it('returns to the My Notes hub with the learner context', async () => {
    mockReturnTo = 'own-learning';
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('Chemistry'));
    fireEvent.press(screen.getByTestId('my-notes-list-back'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/my-notes',
      params: { returnTo: 'own-learning' },
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('renders notes and opens the source topic', async () => {
    mockKind = 'notes';
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('Ionic bonds transfer electrons.'));
    fireEvent.press(screen.getByTestId(`my-notes-row-notes-${NOTE_ID}`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/[topicId]',
      params: { subjectId: SUBJECT_ID, topicId: TOPIC_ID },
    });
  });

  it('renders bookmarks and opens the bookmarked topic', async () => {
    mockKind = 'bookmarks';
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('A covalent bond shares electrons.'));
    fireEvent.press(
      screen.getByTestId(`my-notes-row-bookmarks-${BOOKMARK_ID}`),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/[topicId]',
      params: { subjectId: SUBJECT_ID, topicId: TOPIC_ID },
    });
  });

  it('fetches another notes page when the list reaches the end', async () => {
    mockKind = 'notes';
    mockFetch.setRoute('/notes', (url: string) => {
      if (url.includes('cursor=')) {
        return {
          notes: [
            {
              ...noteRow,
              id: 'a0000000-0000-4000-a000-000000000041',
              content: 'Second page note.',
              updatedAt: '2026-05-12T10:00:00.000Z',
            },
          ],
          nextCursor: null,
        };
      }
      return { notes: [noteRow], nextCursor: NOTE_ID };
    });
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('Ionic bonds transfer electrons.'));
    fireEvent.press(screen.getByTestId('my-notes-load-more'));

    await waitFor(() => screen.getByText('Second page note.'));
  });

  it('shows an error state and retries failed loads', async () => {
    mockKind = 'notes';
    mockFetch.setRoute(
      '/notes',
      () =>
        new Response(JSON.stringify({ error: 'boom' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByTestId('my-notes-error'));
    screen.getByText("Couldn't load notes");

    mockFetch.setRoute('/notes', { notes: [noteRow], nextCursor: null });
    fireEvent.press(screen.getByTestId('my-notes-retry'));

    await waitFor(() => screen.getByText('Ionic bonds transfer electrons.'));
  });

  it('shows empty state for sessions when API returns empty array', async () => {
    mockKind = 'sessions';
    mockFetch.setRoute('/progress/sessions', {
      sessions: [],
      nextCursor: null,
    });
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByTestId('my-notes-empty'));
    screen.getByText('No sessions yet');
    screen.getByText("They'll show up here as you learn.");
  });

  it('shows empty state for bookmarks when API returns empty array', async () => {
    mockKind = 'bookmarks';
    mockFetch.setRoute('/bookmarks', { bookmarks: [], nextCursor: null });
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByTestId('my-notes-empty'));
    screen.getByText('No bookmarks yet');
  });

  it('shows error state for sessions and retries', async () => {
    mockKind = 'sessions';
    mockFetch.setRoute(
      '/progress/sessions',
      () =>
        new Response(JSON.stringify({ error: 'server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByTestId('my-notes-error'));
    screen.getByText("Couldn't load sessions");

    mockFetch.setRoute('/progress/sessions', {
      sessions: [sessionRow],
      nextCursor: null,
    });
    fireEvent.press(screen.getByTestId('my-notes-retry'));

    await waitFor(() => screen.getByText('Chemistry'));
  });

  it('shows error state for bookmarks and retries', async () => {
    mockKind = 'bookmarks';
    mockFetch.setRoute(
      '/bookmarks',
      () =>
        new Response(JSON.stringify({ error: 'server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByTestId('my-notes-error'));
    screen.getByText("Couldn't load bookmarks");

    mockFetch.setRoute('/bookmarks', {
      bookmarks: [bookmarkRow],
      nextCursor: null,
    });
    fireEvent.press(screen.getByTestId('my-notes-retry'));

    await waitFor(() => screen.getByText('A covalent bond shares electrons.'));
  });

  it('fetches another sessions page when load-more is pressed', async () => {
    mockKind = 'sessions';
    mockFetch.setRoute('/progress/sessions', (url: string) => {
      if (url.includes('cursor=')) {
        return {
          sessions: [
            {
              ...sessionRow,
              sessionId: 'a0000000-0000-4000-a000-000000000031',
              highlight: 'Second page session.',
              startedAt: '2026-05-12T10:00:00.000Z',
            },
          ],
          nextCursor: null,
        };
      }
      return { sessions: [sessionRow], nextCursor: SESSION_ID };
    });
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('Covalent bonds clicked.'));
    fireEvent.press(screen.getByTestId('my-notes-load-more'));

    await waitFor(() => screen.getByText('Second page session.'));
  });

  it('fetches another bookmarks page when load-more is pressed', async () => {
    mockKind = 'bookmarks';
    mockFetch.setRoute('/bookmarks', (url: string) => {
      if (url.includes('cursor=')) {
        return {
          bookmarks: [
            {
              ...bookmarkRow,
              id: 'a0000000-0000-4000-a000-000000000051',
              content: 'Second page bookmark.',
              createdAt: '2026-05-12T10:00:00.000Z',
            },
          ],
          nextCursor: null,
        };
      }
      return { bookmarks: [bookmarkRow], nextCursor: BOOKMARK_ID };
    });
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('A covalent bond shares electrons.'));
    fireEvent.press(screen.getByTestId('my-notes-load-more'));

    await waitFor(() => screen.getByText('Second page bookmark.'));
  });

  it('groups sessions by subject when subject toggle is selected', async () => {
    mockKind = 'sessions';
    const secondSession = {
      ...sessionRow,
      sessionId: 'a0000000-0000-4000-a000-000000000032',
      subjectId: 'a0000000-0000-4000-a000-000000000011',
      subjectName: 'Physics',
      topicId: 'a0000000-0000-4000-a000-000000000021',
      topicTitle: 'Newton Laws',
      highlight: 'Force equals mass times acceleration.',
      startedAt: '2026-05-14T10:00:00.000Z',
    };
    mockFetch.setRoute('/progress/sessions', {
      sessions: [sessionRow, secondSession],
      nextCursor: null,
    });

    render(<MyNotesListScreen />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByText('Chemistry'));

    fireEvent.press(screen.getByTestId('my-notes-group-subject'));

    // Both subject headers should be visible after switching to subject group
    screen.getAllByText('Chemistry');
    screen.getAllByText('Physics');
    screen.getByText('Force equals mass times acceleration.');
  });

  it('groups notes by date by default and switches to subject', async () => {
    mockKind = 'notes';
    const secondNote = {
      ...noteRow,
      id: 'a0000000-0000-4000-a000-000000000041',
      subjectId: 'a0000000-0000-4000-a000-000000000011',
      subjectName: 'Physics',
      topicId: 'a0000000-0000-4000-a000-000000000021',
      topicTitle: 'Newton Laws',
      content: 'F = ma is Newton second law.',
      updatedAt: '2026-05-14T10:00:00.000Z',
    };
    mockFetch.setRoute('/notes', {
      notes: [noteRow, secondNote],
      nextCursor: null,
    });

    render(<MyNotesListScreen />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByText('Ionic bonds transfer electrons.'));

    // Switch to subject grouping — headers become subject names
    fireEvent.press(screen.getByTestId('my-notes-group-subject'));

    screen.getAllByText('Chemistry');
    screen.getAllByText('Physics');
    screen.getByText('F = ma is Newton second law.');
  });

  it('subtitle shows correct item count', async () => {
    mockKind = 'sessions';
    mockFetch.setRoute('/progress/sessions', {
      sessions: [sessionRow],
      nextCursor: null,
    });
    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() => screen.getByText('1 session'));
  });

  it('back button on list navigates to my-notes hub', () => {
    render(<MyNotesListScreen />, { wrapper: createWrapper() });
    fireEvent.press(screen.getByTestId('my-notes-list-back'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/my-notes',
      params: { returnTo: 'own-learning' },
    });
  });

  it('bookmark with null topicId falls back to session-summary navigation', async () => {
    mockKind = 'bookmarks';
    const bookmarkNoTopic = {
      ...bookmarkRow,
      topicId: null,
      topicTitle: null,
    };
    mockFetch.setRoute('/bookmarks', {
      bookmarks: [bookmarkNoTopic],
      nextCursor: null,
    });

    render(<MyNotesListScreen />, { wrapper: createWrapper() });

    await waitFor(() =>
      screen.getByTestId(`my-notes-row-bookmarks-${BOOKMARK_ID}`),
    );
    fireEvent.press(
      screen.getByTestId(`my-notes-row-bookmarks-${BOOKMARK_ID}`),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: { sessionId: SESSION_ID },
    });
  });
});
