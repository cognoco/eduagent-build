import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';

import {
  createScreenWrapper,
  createTestProfile,
} from '../../../../test-utils/screen-render';
import type { RoutedMockFetch } from '../../../../test-utils/mock-api-routes';
import SubjectHubRoute from './index';
import { FEATURE_FLAGS } from '../../../../lib/feature-flags';

jest.mock(
  'react-i18next',
  () => require('../../../../test-utils/mock-i18n').i18nMock,
);

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../../../lib/api-client' /* gc1-allow: Clerk useAuth() external boundary; real api-client requires a live Hono server */,
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams: () => { subjectId?: string | string[] } = () => ({
  subjectId: SUBJECT_ID,
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams(),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => false,
    push: mockPush,
    replace: mockReplace,
  }),
}));

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BOOK_ID = '660e8400-e29b-41d4-a716-446655440001';
const TOPIC_ID = '770e8400-e29b-41d4-a716-446655440002';
const SESSION_ID = '880e8400-e29b-41d4-a716-446655440003';

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return createScreenWrapper({
    activeProfile: createTestProfile(),
    profiles: [createTestProfile()],
    queryClient,
  }).wrapper;
}

function seedRoutes() {
  mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books/${BOOK_ID}/sessions`, {
    sessions: [
      {
        id: SESSION_ID,
        topicId: TOPIC_ID,
        topicTitle: 'Greetings',
        chapter: 'Basics',
        exchangeCount: 2,
        createdAt: '2026-06-12T10:00:00.000Z',
      },
    ],
  });
  mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books/${BOOK_ID}`, {
    book: {
      id: BOOK_ID,
      subjectId: SUBJECT_ID,
      title: 'Spanish 1',
      description: null,
      emoji: null,
      sortOrder: 1,
      topicsGenerated: true,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    topics: [
      {
        id: TOPIC_ID,
        title: 'Greetings',
        description: 'Say hello.',
        sortOrder: 1,
        relevance: 'core',
        estimatedMinutes: 20,
        bookId: BOOK_ID,
        chapter: 'Basics',
        skipped: false,
      },
    ],
    connections: [],
    status: 'IN_PROGRESS',
    completedTopicIds: [],
  });
  mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, {
    books: [
      {
        id: BOOK_ID,
        subjectId: SUBJECT_ID,
        title: 'Spanish 1',
        description: null,
        emoji: null,
        sortOrder: 1,
        topicsGenerated: true,
        status: 'IN_PROGRESS',
        topicCount: 1,
        completedTopicCount: 0,
        masteredTopicCount: 0,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  });
  mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
    topics: [],
    reviewDueCount: 0,
  });
  mockFetch.setRoute('/progress/resume-target', {
    target: {
      subjectId: SUBJECT_ID,
      subjectName: 'Spanish',
      topicId: TOPIC_ID,
      topicTitle: 'Greetings',
      sessionId: SESSION_ID,
      resumeFromSessionId: null,
      resumeKind: 'active_session',
      lastActivityAt: '2026-06-12T10:00:00.000Z',
      reason: 'You were in the middle of this.',
    },
  });
  mockFetch.setRoute('/notes', { notes: [], nextCursor: null });
  mockFetch.setRoute('/bookmarks', { bookmarks: [], nextCursor: null });
  mockFetch.setRoute('/subjects', {
    subjects: [
      {
        id: SUBJECT_ID,
        profileId: '990e8400-e29b-41d4-a716-446655440004',
        name: 'Spanish',
        status: 'active',
        curriculumStatus: 'ready',
        pedagogyMode: 'socratic',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  });
}

describe('SubjectHubRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
  });

  it('renders hub data and resumes active sessions by sessionId', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-screen');
    });
    screen.getByText('Spanish');
    screen.getByTestId('subject-hub-next-up-action');

    fireEvent.press(screen.getByTestId('subject-hub-next-up-action'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          sessionId: SESSION_ID,
        }),
      }),
    );
  });

  it('routes due-review next-up actions into the existing topic review flow', async () => {
    mockFetch.setRoute('/progress/resume-target', { target: null });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
      topics: [
        {
          topicId: TOPIC_ID,
          xpStatus: 'pending',
          masteredAt: null,
          nextReviewAt: '2026-06-13T00:00:00.000Z',
        },
      ],
      reviewDueCount: 1,
    });

    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-screen');
    });

    fireEvent.press(screen.getByTestId('subject-hub-next-up-action'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/topic/[topicId]',
        params: { subjectId: SUBJECT_ID, topicId: TOPIC_ID },
      }),
    );
  });

  it('renders a recoverable error when subjectId is missing', () => {
    mockSearchParams = () => ({});

    render(<SubjectHubRoute />, { wrapper: wrapper() });

    screen.getByTestId('subject-hub-missing-param');
    fireEvent.press(screen.getByTestId('subject-hub-missing-param-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('falls back to the V2 Subjects tab when MODE_NAV_V2_ENABLED is on', () => {
    mockSearchParams = () => ({});
    const originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      true;
    try {
      render(<SubjectHubRoute />, { wrapper: wrapper() });

      screen.getByTestId('subject-hub-missing-param');
      fireEvent.press(screen.getByTestId('subject-hub-missing-param-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/subjects');
    } finally {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        originalV2;
    }
  });
});
