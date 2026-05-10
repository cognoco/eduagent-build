import { render, screen, fireEvent } from '@testing-library/react-native';

import SubjectSessionsScreen from './sessions';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'progress.subjectSessions.title': 'Past conversations',
        'progress.subjectSessions.empty': 'No conversations yet',
        'progress.subjectSessions.untitledTopic': 'Untitled topic',
        'progress.subjectSessions.openSessionFrom':
          'Open session from {{date}}',
        'common.tryAgain': 'Try Again',
        'common.goBack': 'Go back',
      };
      const template = map[key];
      if (!template) return key;
      if (!opts) return template;
      return Object.entries(opts).reduce(
        (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
        template,
      );
    },
  }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ subjectId: 's1' }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../../../../components/common', () => {
  const RN = jest.requireActual('react-native');
  const ErrorFallback = ({
    message,
    primaryAction,
    secondaryAction,
    testID,
  }: any) => (
    <RN.View testID={testID}>
      <RN.Text>{message}</RN.Text>
      {primaryAction ? (
        <RN.Pressable
          onPress={primaryAction.onPress}
          testID={primaryAction.testID}
        >
          <RN.Text>{primaryAction.label}</RN.Text>
        </RN.Pressable>
      ) : null}
      {secondaryAction ? (
        <RN.Pressable
          onPress={secondaryAction.onPress}
          testID={secondaryAction.testID}
        >
          <RN.Text>{secondaryAction.label}</RN.Text>
        </RN.Pressable>
      ) : null}
    </RN.View>
  );
  return { ErrorFallback };
});

jest.mock('../../../../lib/format-relative-date', () => ({
  formatRelativeDate: (iso: string) => `formatted(${iso})`,
}));

jest.mock('../../../../lib/format-api-error', () => ({
  classifyApiError: () => ({
    kind: 'network',
    message: 'Network error',
  }),
}));

jest.mock('../../../../lib/navigation', () => ({
  goBackOrReplace: jest.fn(),
}));

const mockUseSubjectSessions = jest.fn();
jest.mock('../../../../hooks/use-subject-sessions', () => ({
  useSubjectSessions: (...args: unknown[]) => mockUseSubjectSessions(...args),
}));

const mockUseProgressInventory = jest.fn();
jest.mock('../../../../hooks/use-progress', () => ({
  useProgressInventory: () => mockUseProgressInventory(),
}));

const SAMPLE_SESSIONS = [
  {
    id: 'sess-1',
    topicId: 'topic-1',
    topicTitle: 'Fractions',
    bookId: 'book-1',
    bookTitle: 'Numbers',
    chapter: 'Chapter 1',
    sessionType: 'learning',
    durationSeconds: 600,
    createdAt: '2026-05-01T10:00:00.000Z',
  },
  {
    id: 'sess-2',
    topicId: null,
    topicTitle: null,
    bookId: null,
    bookTitle: null,
    chapter: null,
    sessionType: 'learning',
    durationSeconds: null,
    createdAt: '2026-04-30T08:00:00.000Z',
  },
];

const INVENTORY = {
  data: { subjects: [{ subjectId: 's1', subjectName: 'Math' }] },
};

describe('SubjectSessionsScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockUseProgressInventory.mockReturnValue(INVENTORY);
  });

  it('renders the loading skeleton while sessions load', () => {
    mockUseSubjectSessions.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      error: null,
      refetch: jest.fn(),
    });
    render(<SubjectSessionsScreen />);
    screen.getByTestId('subject-sessions-loading');
  });

  it('renders empty state when there are no sessions', () => {
    mockUseSubjectSessions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
      error: null,
      refetch: jest.fn(),
    });
    render(<SubjectSessionsScreen />);
    screen.getByTestId('subject-sessions-empty');
    screen.getByText('No conversations yet');
  });

  it('renders error state with retry that calls refetch', () => {
    const refetch = jest.fn();
    mockUseSubjectSessions.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      error: new Error('boom'),
      refetch,
    });
    render(<SubjectSessionsScreen />);
    fireEvent.press(screen.getByTestId('subject-sessions-error-retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders one row per session and links to session-summary', () => {
    mockUseSubjectSessions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: SAMPLE_SESSIONS,
      error: null,
      refetch: jest.fn(),
    });
    render(<SubjectSessionsScreen />);
    screen.getByTestId('subject-session-sess-1');
    screen.getByTestId('subject-session-sess-2');
    screen.getByText('Fractions');
    // Null topicTitle falls back to "Untitled topic"
    screen.getByText('Untitled topic');

    fireEvent.press(screen.getByTestId('subject-session-sess-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: 'sess-1',
        subjectId: 's1',
        topicId: 'topic-1',
      },
    });
  });

  it('shows the subject name as subtitle', () => {
    mockUseSubjectSessions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
      error: null,
      refetch: jest.fn(),
    });
    render(<SubjectSessionsScreen />);
    screen.getByText('Math');
    screen.getByText('Past conversations');
  });
});
