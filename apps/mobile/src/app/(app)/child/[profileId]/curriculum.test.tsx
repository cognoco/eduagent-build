import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseChildDetail = jest.fn();
const mockUseDashboard = jest.fn();
const mockCanEnter = jest.fn(() => true);

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.defaultValue === 'string') {
        return opts.defaultValue;
      }
      return key;
    },
  }),
}));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'redirect-target' }, href);
  },
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../../../../hooks/use-dashboard' /* gc1-allow: route screen test controls dashboard payloads without API providers */,
  () => ({
    useChildDetail: (...args: unknown[]) => mockUseChildDetail(...args),
    useDashboard: (...args: unknown[]) => mockUseDashboard(...args),
  }),
);

jest.mock(
  '../../../../hooks/use-navigation-contract' /* gc1-allow: route guard test pins contract result */,
  () => ({
    useNavigationContract: () => ({ canEnter: mockCanEnter }),
  }),
);

jest.mock(
  '../../../../lib/feature-flags' /* gc1-allow: test pins nav-v1 flag to isolate curriculum route guard behaviour */,
  () => ({
    FEATURE_FLAGS: {
      MODE_NAV_V1_ENABLED: true,
    },
  }),
);

jest.mock(
  '../../../../lib/navigation' /* gc1-allow: back fallback helper is not under test here */,
  () => ({
    FAMILY_HOME_PATH: '/(app)/home',
    childProfileHref: (profileId: string) => `/(app)/child/${profileId}`,
    goBackOrReplace: jest.fn(),
  }),
);

jest.mock(
  '../../../../lib/theme' /* gc1-allow: theme hook requires app color providers outside this route test */,
  () => ({
    useThemeColors: () => ({ textSecondary: '#667085' }),
  }),
);

const ChildCurriculumScreen = require('./curriculum').default;

describe('ChildCurriculumScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanEnter.mockReturnValue(true);
    mockUseLocalSearchParams.mockReturnValue({ profileId: 'child-001' });
    mockUseChildDetail.mockReturnValue({
      data: {
        profileId: 'child-001',
        displayName: 'Emma',
        subjects: [
          {
            subjectId: '11111111-1111-7111-8111-111111111111',
            name: 'Mathematics',
            retentionStatus: 'strong',
            rawInput: 'math homework',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseDashboard.mockReturnValue({ data: { children: [] } });
  });

  it('renders the child curriculum subject overview and opens a subject', () => {
    render(<ChildCurriculumScreen />);

    screen.getByTestId('child-curriculum-screen');
    screen.getByText("Browse Emma's subjects and topics");
    screen.getByText('Mathematics');
    screen.getByText('Started from: math homework');

    fireEvent.press(
      screen.getByTestId(
        'child-curriculum-subject-11111111-1111-7111-8111-111111111111',
      ),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
      params: {
        profileId: 'child-001',
        subjectId: '11111111-1111-7111-8111-111111111111',
        subjectName: 'Mathematics',
        childName: 'Emma',
      },
    });
  });

  it('uses dashboard data as a fallback when child detail is unavailable', () => {
    mockUseChildDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });
    mockUseDashboard.mockReturnValue({
      data: {
        children: [
          {
            profileId: 'child-001',
            displayName: 'Emma',
            subjects: [
              {
                subjectId: '22222222-2222-7222-8222-222222222222',
                name: 'Science',
                retentionStatus: 'fading',
              },
            ],
          },
        ],
      },
    });

    render(<ChildCurriculumScreen />);

    screen.getByText('Science');
    expect(screen.queryByTestId('child-curriculum-error')).toBeNull();
  });

  it('shows a not-linked state when the navigation contract blocks the child curriculum route', () => {
    mockCanEnter.mockReturnValue(false);

    render(<ChildCurriculumScreen />);

    screen.getByTestId('child-curriculum-not-linked');
    screen.getByText("This child's curriculum is not available");

    fireEvent.press(screen.getByTestId('child-curriculum-not-linked-back'));

    const { goBackOrReplace } = require('../../../../lib/navigation');
    expect(goBackOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({ replace: mockReplace }),
      '/(app)/home',
    );
  });

  // [PARENT-17] loading / error / empty / missing-profile branches. The happy
  // path + dashboard fallback + not-linked gate are covered above; these pin
  // the remaining four states the screen renders.

  it('[PARENT-17] shows the loading spinner while child detail is still resolving', () => {
    mockUseChildDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseDashboard.mockReturnValue({ data: { children: [] } });

    render(<ChildCurriculumScreen />);

    screen.getByTestId('child-curriculum-loading');
    expect(screen.queryByTestId('child-curriculum-screen')).toBeNull();
  });

  it('[PARENT-17] shows an error state with a retry that re-fetches when detail fails and dashboard has no fallback', () => {
    const refetch = jest.fn();
    mockUseChildDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    mockUseDashboard.mockReturnValue({ data: { children: [] } });

    render(<ChildCurriculumScreen />);

    screen.getByTestId('child-curriculum-error');
    expect(screen.queryByTestId('child-curriculum-screen')).toBeNull();

    fireEvent.press(screen.getByTestId('child-curriculum-retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('[PARENT-17] shows the empty state when the linked child has no subjects yet', () => {
    mockUseChildDetail.mockReturnValue({
      data: {
        profileId: 'child-001',
        displayName: 'Emma',
        subjects: [],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseDashboard.mockReturnValue({ data: { children: [] } });

    render(<ChildCurriculumScreen />);

    screen.getByTestId('child-curriculum-screen');
    screen.getByTestId('child-curriculum-empty');
    screen.getByText('No lesson topics yet');
  });

  it('[PARENT-17] shows the missing-profile fallback when no profileId is present', () => {
    mockUseLocalSearchParams.mockReturnValue({});

    render(<ChildCurriculumScreen />);

    screen.getByTestId('child-curriculum-missing-profile');
    expect(screen.queryByTestId('child-curriculum-screen')).toBeNull();

    fireEvent.press(screen.getByTestId('child-curriculum-missing-back'));
    const { goBackOrReplace } = require('../../../../lib/navigation');
    expect(goBackOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({ replace: mockReplace }),
      '/(app)/home',
    );
  });
});
