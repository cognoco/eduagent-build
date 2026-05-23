import { render, screen, fireEvent } from '@testing-library/react-native';

import { ModeSwitcher } from './ModeSwitcher';

// react-i18next: use real en.json lookup so assertions hit rendered text
jest.mock('react-i18next', () => require('../../test-utils/mock-i18n').i18nMock);

// useNavigationContract wraps context + query state — boundary mock
// gc1-allow: hook wraps profile context, subscription query, and feature flags; not exercisable in isolation
const mockUseNavigationContract = jest.fn();
jest.mock('../../hooks/use-navigation-contract', () => ({
  useNavigationContract: (...args: unknown[]) =>
    mockUseNavigationContract(...args),
}));

// useModeSwitch wraps router, queryClient, and app context — boundary mock
// gc1-allow: hook wraps expo-router, TanStack QueryClient, and native SecureStore; not exercisable in isolation
const mockSwitchMode = jest.fn();
jest.mock('../../lib/use-mode-switch', () => ({
  useModeSwitch: () => ({
    switchMode: mockSwitchMode,
    isSwitching: false,
    isSwitchingRef: { current: false },
  }),
}));

function buildContract(
  modeSwitcher: 'global-header' | 'hidden',
  effectiveAppContext: 'study' | 'family' = 'study',
) {
  return {
    chrome: { modeSwitcher, proxyBanner: 'hidden' as const },
    effectiveAppContext,
    shape: 'learner' as const,
    isFamilyCapable: modeSwitcher === 'global-header',
    isParentProxy: false,
    visibleTabs: new Set(['home', 'library', 'progress', 'more']),
    home: {
      screen: 'LearnerHome' as const,
      titleKey: 'tabs.myLearning' as const,
      iconName: 'School' as const,
    },
    gates: {
      sessionIsOwner: true,
      canAccessBilling: true,
      canAddChild: false,
      canViewFamilyProgress: false,
    },
    canEnter: () => true,
    isSurfaced: () => true,
    queryScope: { appContext: effectiveAppContext, profileId: 'test-profile' },
    diagnostic: {
      activeProfileId: 'test-profile',
      effectiveAppContext,
      isFamilyCapable: modeSwitcher === 'global-header',
      isParentProxy: false,
      linkedChildIds: [],
      reason: 'test',
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ModeSwitcher', () => {
  it('renders nothing when chrome.modeSwitcher is hidden', () => {
    mockUseNavigationContract.mockReturnValue(buildContract('hidden'));

    render(<ModeSwitcher />);

    expect(screen.queryByTestId('mode-switcher')).toBeNull();
  });

  it('renders both pressables when chrome.modeSwitcher is global-header; active mode is selected', () => {
    mockUseNavigationContract.mockReturnValue(
      buildContract('global-header', 'study'),
    );

    render(<ModeSwitcher />);

    expect(screen.getByTestId('mode-switcher')).toBeTruthy();

    const studyBtn = screen.getByTestId('mode-switcher-study');
    const familyBtn = screen.getByTestId('mode-switcher-family');

    expect(studyBtn).toBeTruthy();
    expect(familyBtn).toBeTruthy();

    // Study is current mode → selected true; family → selected false
    expect(studyBtn.props.accessibilityState).toEqual({ selected: true });
    expect(familyBtn.props.accessibilityState).toEqual({ selected: false });
  });

  it('calls switchMode with the other mode when non-active pressable is pressed', () => {
    mockUseNavigationContract.mockReturnValue(
      buildContract('global-header', 'study'),
    );

    render(<ModeSwitcher />);

    fireEvent.press(screen.getByTestId('mode-switcher-family'));

    expect(mockSwitchMode).toHaveBeenCalledTimes(1);
    expect(mockSwitchMode).toHaveBeenCalledWith('family');
  });

  it('marks family as selected when effectiveAppContext is family', () => {
    mockUseNavigationContract.mockReturnValue(
      buildContract('global-header', 'family'),
    );

    render(<ModeSwitcher />);

    const studyBtn = screen.getByTestId('mode-switcher-study');
    const familyBtn = screen.getByTestId('mode-switcher-family');

    expect(familyBtn.props.accessibilityState).toEqual({ selected: true });
    expect(studyBtn.props.accessibilityState).toEqual({ selected: false });
  });

  it('calls switchMode with study when user in family mode presses study button', () => {
    mockUseNavigationContract.mockReturnValue(
      buildContract('global-header', 'family'),
    );

    render(<ModeSwitcher />);

    fireEvent.press(screen.getByTestId('mode-switcher-study'));

    expect(mockSwitchMode).toHaveBeenCalledTimes(1);
    expect(mockSwitchMode).toHaveBeenCalledWith('study');
  });
});
