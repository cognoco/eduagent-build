import { renderHook } from '@testing-library/react-native';

import { FEATURE_FLAGS } from '../lib/feature-flags';
import { useNavigationShellContract } from './use-navigation-contract';

const mockUseActiveProfileRole = jest.fn();
const mockUseAppContext = jest.fn();
const mockUseParentProxy = jest.fn();
const mockUseProfile = jest.fn();
const mockUseSubscriptionStatus = jest.fn();

jest.mock('./use-active-profile-role', () => ({
  useActiveProfileRole: () => mockUseActiveProfileRole(),
}));

jest.mock('./use-parent-proxy', () => ({
  useParentProxy: () => mockUseParentProxy(),
}));

jest.mock('./use-subscription', () => ({
  useSubscriptionStatus: (args: unknown) => mockUseSubscriptionStatus(args),
}));

jest.mock('../lib/app-context', () => ({
  useAppContext: () => mockUseAppContext(),
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => mockUseProfile(),
}));

function setFlag<K extends keyof typeof FEATURE_FLAGS>(
  key: K,
  value: (typeof FEATURE_FLAGS)[K],
): void {
  (FEATURE_FLAGS as Record<K, (typeof FEATURE_FLAGS)[K]>)[key] = value;
}

describe('useNavigationShellContract', () => {
  const originalV0 = FEATURE_FLAGS.MODE_NAV_V0_ENABLED;
  const originalV1 = FEATURE_FLAGS.MODE_NAV_V1_ENABLED;
  const originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    setFlag('MODE_NAV_V0_ENABLED', true);
    setFlag('MODE_NAV_V1_ENABLED', false);
    setFlag('MODE_NAV_V2_ENABLED', false);

    mockUseActiveProfileRole.mockReturnValue('owner');
    mockUseAppContext.mockReturnValue({
      familyCapable: true,
      mode: 'family',
    });
    mockUseParentProxy.mockReturnValue({
      childProfile: null,
      isParentProxy: false,
      parentProfile: null,
    });
    mockUseProfile.mockReturnValue({
      activeProfile: { id: 'parent', isOwner: true },
      profiles: [
        { id: 'parent', isOwner: true },
        { id: 'child', isOwner: false },
      ],
    });
    mockUseSubscriptionStatus.mockReturnValue({
      data: {
        billingAccess: 'current',
        effectiveAccessTier: 'family',
        tier: 'family',
      },
    });
  });

  afterEach(() => {
    setFlag('MODE_NAV_V0_ENABLED', originalV0);
    setFlag('MODE_NAV_V1_ENABLED', originalV1);
    setFlag('MODE_NAV_V2_ENABLED', originalV2);
  });

  it('returns the additive three-tab V2 shell when V2 is enabled', () => {
    setFlag('MODE_NAV_V2_ENABLED', true);
    setFlag('MODE_NAV_V1_ENABLED', true);

    const { result } = renderHook(() => useNavigationShellContract());

    expect([...result.current.visibleTabs].sort()).toEqual([
      'journal',
      'mentor',
      'subjects',
    ]);
    expect(result.current.homeTabPresentation).toEqual({
      accessibilityLabelKey: 'tabs.mentorLabel',
      iconName: 'Home',
      titleKey: 'tabs.mentor',
    });
  });

  it('keeps the legacy shell result when V2 is disabled', () => {
    const { result } = renderHook(() => useNavigationShellContract());

    expect([...result.current.visibleTabs].sort()).toEqual([
      'home',
      'more',
      'progress',
    ]);
    expect(result.current.homeTabPresentation).toEqual({
      accessibilityLabelKey: 'tabs.familyHubLabel',
      iconName: 'Home',
      titleKey: 'tabs.familyHub',
    });
  });
});
