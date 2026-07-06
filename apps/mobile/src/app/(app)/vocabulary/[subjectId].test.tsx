import { render, screen } from '@testing-library/react-native';
import { ProfileContext, type ProfileContextValue } from '../../../lib/profile';
import { createTestProfile } from '../../../test-utils/app-hook-test-utils';

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
  // gc1-allow: this test only asserts F-168 param normalisation via hook-arg
  // capture; wiring QueryClientProvider + a mocked network stack to run the
  // real hook is unrelated scope for this regression test
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
  // gc1-allow: same as use-vocabulary above — this test asserts param
  // normalisation only; running the real query hook is unrelated scope
  () => ({
    useSubjects: () => ({
      data: [{ id: 'subject-1', name: 'Biology' }],
    }),
  }),
);

const VocabularyListScreen = require('./[subjectId]').default;

const ownerProfile = createTestProfile({
  id: 'owner-profile',
  isOwner: true,
  displayName: 'Owner',
});
const childProfile = createTestProfile({
  id: 'child-profile',
  isOwner: false,
  displayName: 'Child',
});

function renderVocabularyScreen(profileContext?: Partial<ProfileContextValue>) {
  const value: ProfileContextValue = {
    profiles: [ownerProfile, childProfile],
    activeProfile: ownerProfile,
    isExplicitProxyMode: false,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
    ...profileContext,
  };

  return render(
    <ProfileContext.Provider value={value}>
      <VocabularyListScreen />
    </ProfileContext.Provider>,
  );
}

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
    renderVocabularyScreen();
    expect(screen.queryByTestId('vocabulary-no-subject')).toBeNull();
  });

  it('[F-168] passes a string (not array) to useVocabulary when param is an array', () => {
    // Expo Router can return string | string[] for dynamic params. Without
    // the fix, the raw array is passed directly to useVocabulary — a runtime
    // type error that causes incorrect API requests.
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: ['subject-1', 'subject-2'],
    });

    renderVocabularyScreen();

    // With the fix: first element extracted → useVocabulary receives 'subject-1'.
    expect(typeof capturedVocabularySubjectId).toBe('string');
    expect(capturedVocabularySubjectId).toBe('subject-1');
  });

  it('shows delete affordances for owner self-view', () => {
    mockUseVocabulary.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: 'vocab-1',
          term: 'bonjour',
          translation: 'hello',
          type: 'word',
          cefrLevel: 'A1',
          mastered: false,
        },
      ],
    });

    renderVocabularyScreen();

    screen.getByTestId('vocab-delete-vocab-1');
  });

  it('hides delete affordances while parent-proxy is viewing a child vocabulary list', () => {
    mockUseVocabulary.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: 'vocab-1',
          term: 'bonjour',
          translation: 'hello',
          type: 'word',
          cefrLevel: 'A1',
          mastered: false,
        },
      ],
    });

    renderVocabularyScreen({
      activeProfile: childProfile,
      isExplicitProxyMode: true,
    });

    screen.getByTestId('vocab-item-vocab-1');
    expect(screen.queryByTestId('vocab-delete-vocab-1')).toBeNull();
  });
});
