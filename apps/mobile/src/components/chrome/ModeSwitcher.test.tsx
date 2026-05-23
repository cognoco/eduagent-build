import { render, screen, fireEvent } from '@testing-library/react-native';

import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { ModeSwitcher } from './ModeSwitcher';

// react-i18next: use real en.json lookup so assertions hit rendered text
jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockUseNavigationContract = jest.fn();
jest.mock(
  '../../hooks/use-navigation-contract' /* gc1-allow: hook wraps profile context, subscription query, and feature flags; not exercisable in isolation */,
  () => ({
    useNavigationContract: (...args: unknown[]) =>
      mockUseNavigationContract(...args),
  }),
);

const mockUseParentProxy = jest.fn();
jest.mock(
  '../../hooks/use-parent-proxy' /* gc1-allow: chrome fallback only needs proxy state; full profile/provider stack is covered elsewhere */,
  () => ({
    useParentProxy: (...args: unknown[]) => mockUseParentProxy(...args),
  }),
);

const mockUseAppContext = jest.fn();
jest.mock(
  '../../lib/app-context' /* gc1-allow: chrome fallback only needs app mode/family capability; provider mutation flow is tested separately */,
  () => ({
    useAppContext: (...args: unknown[]) => mockUseAppContext(...args),
  }),
);

const mockSwitchMode = jest.fn();
jest.mock(
  '../../lib/use-mode-switch' /* gc1-allow: hook wraps expo-router, TanStack QueryClient, and native SecureStore; not exercisable in isolation */,
  () => ({
    useModeSwitch: () => ({
      switchMode: mockSwitchMode,
      isSwitching: false,
      isSwitchingRef: { current: false },
    }),
  }),
);

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

function setModeNavFlags(input: { v0: boolean; v1: boolean }): void {
  const mutableFlags = FEATURE_FLAGS as unknown as {
    MODE_NAV_V0_ENABLED: boolean;
    MODE_NAV_V1_ENABLED: boolean;
  };
  mutableFlags.MODE_NAV_V0_ENABLED = input.v0;
  mutableFlags.MODE_NAV_V1_ENABLED = input.v1;
}

beforeEach(() => {
  jest.clearAllMocks();
  setModeNavFlags({ v0: false, v1: false });
  mockUseParentProxy.mockReturnValue({ isParentProxy: false });
  mockUseAppContext.mockReturnValue({
    mode: 'study',
    setMode: jest.fn(),
    familyCapable: false,
  });
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

    expect(studyBtn.props.accessibilityState).toEqual({ selected: true });
    expect(familyBtn.props.accessibilityState).toEqual({ selected: false });
  });

  it('renders for legacy V0 family-capable mode nav when V1 contract hides it', () => {
    setModeNavFlags({ v0: true, v1: false });
    mockUseNavigationContract.mockReturnValue(buildContract('hidden', 'study'));
    mockUseAppContext.mockReturnValue({
      mode: 'family',
      setMode: jest.fn(),
      familyCapable: true,
    });

    render(<ModeSwitcher />);

    const studyBtn = screen.getByTestId('mode-switcher-study');
    const familyBtn = screen.getByTestId('mode-switcher-family');

    expect(studyBtn.props.accessibilityState).toEqual({ selected: false });
    expect(familyBtn.props.accessibilityState).toEqual({ selected: true });
  });

  it('keeps the V1 contract authoritative when V1 hides the switcher', () => {
    setModeNavFlags({ v0: true, v1: true });
    mockUseNavigationContract.mockReturnValue(buildContract('hidden', 'study'));
    mockUseAppContext.mockReturnValue({
      mode: 'family',
      setMode: jest.fn(),
      familyCapable: true,
    });

    render(<ModeSwitcher />);

    expect(screen.queryByTestId('mode-switcher')).toBeNull();
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