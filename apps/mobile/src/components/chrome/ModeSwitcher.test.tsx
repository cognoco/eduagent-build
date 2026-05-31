import { render, screen, fireEvent } from '@testing-library/react-native';

import { ModeSwitcher } from './ModeSwitcher';

// react-i18next: use real en.json lookup so assertions hit rendered text
jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

// useNavigationContract internally composes useAppContext + useProfile +
// useSubscription + feature flags. Wiring all four providers in a
// chrome-component unit test would duplicate the navigation-contract.test.ts
// scope without adding contract coverage (which lives in that file and the
// snapshot test). Risk: this test cannot catch a regression in the contract
// resolution itself — only that ModeSwitcher reads the contract correctly.
// TODO(zk): promote ModeSwitcher coverage to an integration test under
// _layout that mounts the real provider chain (tracked as parallel-review
// follow-up).
const mockUseNavigationContract = jest.fn();
jest.mock('../../hooks/use-navigation-contract', () => {
  const actual = jest.requireActual('../../hooks/use-navigation-contract');
  return {
    ...actual,
    useNavigationContract: (...args: unknown[]) =>
      mockUseNavigationContract(...args),
  };
});

let mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  // gc1-allow: native-boundary — the switcher consumes device frame insets.
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

// useModeSwitch internally uses useRouter + useQueryClient + useAppContext.setMode
// (a TanStack mutation with onError/onSuccess). The switch-error state we surface
// here is a UI consequence of setMode's onError callback; the mode-switching
// logic itself is covered in use-mode-switch.test.
const mockSwitchMode = jest.fn();
const mockDismissError = jest.fn();
let mockIsSwitching = false;
let mockSwitchError: 'study' | 'family' | null = null;
jest.mock('../../lib/use-mode-switch', () => {
  const actual = jest.requireActual('../../lib/use-mode-switch');
  return {
    ...actual,
    useModeSwitch: () => ({
      switchMode: mockSwitchMode,
      isSwitching: mockIsSwitching,
      isSwitchingRef: { current: mockIsSwitching },
      switchError: mockSwitchError,
      dismissError: mockDismissError,
    }),
  };
});

function buildContract(
  modeSwitcher: 'global-header' | 'hidden',
  effectiveAppContext: 'study' | 'family' = 'study',
) {
  return {
    chrome: { modeSwitcher, proxyBanner: 'hidden' as const },
    effectiveAppContext,
    shape: effectiveAppContext,
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
  mockIsSwitching = false;
  mockSwitchError = null;
  mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
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
    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.queryByText('Children')).toBeNull();

    // Study is current mode → selected true; family → selected false
    expect(studyBtn.props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    expect(familyBtn.props.accessibilityState).toEqual({
      selected: false,
      disabled: false,
    });
  });

  it('pads the switcher below the device frame safe area', () => {
    mockSafeAreaInsets = { top: 44, bottom: 0, left: 7, right: 9 };
    mockUseNavigationContract.mockReturnValue(
      buildContract('global-header', 'study'),
    );

    render(<ModeSwitcher />);

    expect(screen.getByTestId('mode-switcher-container').props.style).toEqual({
      paddingTop: 44,
      paddingLeft: 7,
      paddingRight: 9,
    });
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

    expect(familyBtn.props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    expect(studyBtn.props.accessibilityState).toEqual({
      selected: false,
      disabled: false,
    });
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

  it('disables both buttons and shows a spinner on the requested side while a switch is in flight', () => {
    mockIsSwitching = true;
    mockUseNavigationContract.mockReturnValue(
      buildContract('global-header', 'study'),
    );

    render(<ModeSwitcher />);

    const studyBtn = screen.getByTestId('mode-switcher-study');
    const familyBtn = screen.getByTestId('mode-switcher-family');

    expect(studyBtn.props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    });
    expect(familyBtn.props.accessibilityState).toEqual({
      selected: false,
      disabled: true,
    });
    // Spinner appears on the side that isn't currently active (the target of
    // the in-flight switch).
    expect(screen.queryByTestId('mode-switcher-family-spinner')).toBeTruthy();
    expect(screen.queryByTestId('mode-switcher-study-spinner')).toBeNull();
  });

  it('renders an error row with retry + dismiss when switchError is set', () => {
    // [BREAK] Earlier behavior silently no-op'd failed switches — the buttons
    // stayed tappable, no toast appeared, and the user had no signal that the
    // server rejected the switch. The error row is the recovery affordance.
    mockSwitchError = 'family';
    mockUseNavigationContract.mockReturnValue(
      buildContract('global-header', 'study'),
    );

    render(<ModeSwitcher />);

    expect(screen.getByTestId('mode-switcher-error')).toBeTruthy();
    fireEvent.press(screen.getByTestId('mode-switcher-error-retry'));
    expect(mockSwitchMode).toHaveBeenCalledWith('family');
  });

  it('dismisses the error row when the dismiss action is pressed', () => {
    mockSwitchError = 'family';
    mockUseNavigationContract.mockReturnValue(
      buildContract('global-header', 'study'),
    );

    render(<ModeSwitcher />);

    fireEvent.press(screen.getByTestId('mode-switcher-error-dismiss'));
    expect(mockDismissError).toHaveBeenCalledTimes(1);
  });
});
