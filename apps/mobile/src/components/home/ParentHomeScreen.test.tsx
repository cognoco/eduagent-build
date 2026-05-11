import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { Profile } from '@eduagent/schemas';

import { ParentHomeScreen } from './ParentHomeScreen';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  '../../lib/theme' /* gc1-allow: theme hook reads native ColorScheme — not available in JSDOM */,
  () => ({
    useThemeColors: () => ({
      textPrimary: '#ffffff',
      textSecondary: '#94a3b8',
      primary: '#00b4d8',
    }),
  }),
);

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native module that requires device/simulator to resolve insets */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

let mockLinkedChildren: Profile[] = [];

jest.mock(
  '../../lib/profile' /* gc1-allow: profile context requires full ProfileProvider setup */,
  () => ({
    useLinkedChildren: () => mockLinkedChildren,
  }),
);

jest.mock(
  '../../hooks/use-dashboard' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useDashboard: () => ({ data: undefined }),
  }),
);

jest.mock(
  '../../hooks/use-progress' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useLearningResumeTarget: () => ({ data: undefined }),
  }),
);

const mockPush = jest.fn();
jest.mock(
  'expo-router' /* gc1-allow: expo-router requires a native navigation container not available in JSDOM */,
  () => ({
    router: { push: mockPush },
    useRouter: () => ({ push: mockPush }),
  }),
);

jest.mock(
  '../family/FamilyOrientationCue' /* gc1-allow: depends on its own hook tree — isolated here to keep test focused */,
  () => ({
    FamilyOrientationCue: () => null,
  }),
);

jest.mock(
  '../family/WithdrawalCountdownBanner' /* gc1-allow: depends on its own hook tree — isolated here to keep test focused */,
  () => ({
    WithdrawalCountdownBanner: () => null,
  }),
);

jest.mock(
  '../../hooks/use-nudges' /* gc1-allow: external hook boundary — wraps TanStack mutation that requires QueryClient */,
  () => ({
    useSendNudge: () => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
    }),
  }),
);

jest.mock(
  '../../lib/platform-alert' /* gc1-allow: wraps Alert.alert which is unavailable in JSDOM */,
  () => ({ platformAlert: jest.fn() }),
);

jest.mock(
  '../../lib/sentry' /* gc1-allow: Sentry SDK loads native module config at import — crashes Jest */,
  () => ({
    Sentry: { captureException: jest.fn() },
  }),
);

jest.mock('./ChildQuotaLine', () => ({
  ChildQuotaLine: () => null,
}));

const makeProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'profile-1',
  accountId: 'account-1',
  displayName: 'Alex Parent',
  isOwner: true,
  hasPremiumLlm: false,
  consentStatus: null,
  conversationLanguage: 'en',
  pronouns: null,
  birthYear: 1985,
  avatarUrl: null,
  location: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const CHILD_A = makeProfile({
  id: 'child-a',
  displayName: 'Emma',
  isOwner: false,
});

const CHILD_B = makeProfile({
  id: 'child-b',
  displayName: 'Liam',
  isOwner: false,
});

describe('ParentHomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLinkedChildren = [];
  });

  it('renders greeting with profile first name', () => {
    render(
      <ParentHomeScreen
        activeProfile={makeProfile({ displayName: 'Alex Parent' })}
      />,
    );

    screen.getByText('Hey Alex');
  });

  it('renders child intent cards for each linked child', () => {
    mockLinkedChildren = [CHILD_A, CHILD_B];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);

    screen.getByTestId('parent-home-check-child-child-a');
    screen.getByTestId('parent-home-check-child-child-b');
    screen.getByTestId('parent-home-weekly-report-child-a');
    screen.getByTestId('parent-home-weekly-report-child-b');
    screen.getByTestId('parent-home-send-nudge-child-a');
    screen.getByTestId('parent-home-send-nudge-child-b');
  });

  it('renders own-learning card', () => {
    render(<ParentHomeScreen activeProfile={makeProfile()} />);

    screen.getByTestId('parent-home-own-learning');
    screen.getByText('Continue your own learning');
  });

  it('shows ParentTransitionNotice', async () => {
    render(
      <ParentHomeScreen
        activeProfile={makeProfile({ id: 'profile-transition' })}
      />,
    );

    await waitFor(() => {
      screen.getByTestId('parent-transition-notice');
    });
  });

  it('pressing nudge card opens NudgeActionSheet for that child', () => {
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);

    expect(screen.queryByTestId('nudge-action-sheet-close')).toBeNull();

    fireEvent.press(screen.getByTestId('parent-home-send-nudge-child-a'));

    screen.getByTestId('nudge-action-sheet-close');
  });
});
