import { render, screen } from '@testing-library/react-native';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

jest.mock('react-native-safe-area-context', () => ({
  // gc1-allow: native-boundary — safe area context requires native device metrics unavailable in Jest
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  // gc1-allow: native-boundary — vector icons requires native font assets unavailable in Jest
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

const mockUseLocalSearchParams = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  // gc1-allow: native-boundary — Expo Router is a platform nav module unavailable in Jest
  useRouter: () => ({ replace: mockReplace, canGoBack: jest.fn(() => false) }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock(
  '../../../lib/theme',
  // gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks
  () => ({
    useThemeColors: () => ({
      primary: '#0ea5e9',
      muted: '#71717a',
      background: '#18181b',
    }),
  }),
);

const mockUseVocabulary = jest.fn();
let capturedVocabularySubjectId: string | string[] | undefined;
jest.mock(
  '../../../hooks/use-vocabulary',
  // gc1-allow: native-boundary — hook reaches into API client + TanStack Query context unavailable in Jest
  () => ({
    useVocabulary: (id: string | string[] | undefined) => {
      capturedVocabularySubjectId = id;
      return mockUseVocabulary(id);
    },
    useDeleteVocabulary: () => ({ mutate: jest.fn(), isPending: false }),
  }),
);

jest.mock(
  '../../../hooks/use-subjects',
  // gc1-allow: native-boundary — hook reaches into API client + TanStack Query context unavailable in Jest
  () => ({
    useSubjects: () => ({
      data: [{ id: 'subject-1', name: 'Biology' }],
    }),
  }),
);

const VocabularyListScreen = require('./[subjectId]').default;

describe('VocabularyListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedVocabularySubjectId = undefined;
    mockUseVocabulary.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    });
    mockUseLocalSearchParams.mockReturnValue({ subjectId: 'subject-1' });
  });

  it('renders the subject name when subjectId is a plain string', () => {
    render(<VocabularyListScreen />);
    expect(screen.queryByTestId('vocabulary-no-subject')).toBeNull();
  });

  it('[F-168] passes a string (not array) to useVocabulary when param is an array', () => {
    // Expo Router can return string | string[] for dynamic params. Without
    // the fix, the raw array is passed directly to useVocabulary — a runtime
    // type error that causes incorrect API requests.
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: ['subject-1', 'subject-2'],
    });

    render(<VocabularyListScreen />);

    // With the fix: first element extracted → useVocabulary receives 'subject-1'.
    expect(typeof capturedVocabularySubjectId).toBe('string');
    expect(capturedVocabularySubjectId).toBe('subject-1');
  });
});
