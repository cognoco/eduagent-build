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
    }),
  }),
);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ kind: mockKind }),
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
});
