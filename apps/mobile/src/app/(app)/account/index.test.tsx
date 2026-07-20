import { fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';

import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import AccountScreen from './index';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
let mockReturnTo: string | undefined;
let modeNavV2Flag: jest.ReplaceProperty<boolean>;
let hardwareBackHandler: (() => boolean | null | undefined) | null;
let removeHardwareBackHandler: jest.Mock;
let addHardwareBackHandlerSpy: jest.SpiedFunction<
  typeof BackHandler.addEventListener
>;
let mockFocusEffectCallback: (() => void | (() => void)) | null;

const originalPlatformOs = Object.getOwnPropertyDescriptor(Platform, 'OS');

function setPlatformOs(os: 'android' | 'ios' | 'web'): void {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
  });
}

const V2_RETURN_CASES = [
  {
    name: 'Mentor token returns exact Mentor',
    returnTo: 'mentor',
    href: '/(app)/mentor',
  },
  {
    name: 'Subjects token returns exact Subjects',
    returnTo: 'subjects',
    href: '/(app)/subjects',
  },
  {
    name: 'Journal token returns exact Journal',
    returnTo: 'journal',
    href: '/(app)/journal',
  },
  {
    name: 'unknown token fails closed to Mentor',
    returnTo: 'unexpected',
    href: '/(app)/mentor',
  },
] as const;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ returnTo: mockReturnTo }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    // Keep the latest registered handler; AccountScreen owns one focus effect per render.
    mockFocusEffectCallback = callback;
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 12, right: 0, bottom: 0, left: 0 }),
}));

jest.mock(
  // gc1-allow: route wrapper test asserts mount boundary; AccountAdminSheet behavior has dedicated coverage
  '../../../components/account/AccountAdminSheet',
  () => ({
    ...jest.requireActual('../../../components/account/AccountAdminSheet'),
    AccountAdminSheet: () => {
      const { Text } = require('react-native');
      return <Text testID="mock-account-admin-sheet" />;
    },
  }),
);

describe('AccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(false);
    mockReturnTo = undefined;
    mockFocusEffectCallback = null;
    hardwareBackHandler = null;
    removeHardwareBackHandler = jest.fn();
    setPlatformOs('android');
    addHardwareBackHandlerSpy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((event, handler) => {
        if (event === 'hardwareBackPress') {
          hardwareBackHandler = handler;
        }
        removeHardwareBackHandler = jest.fn(() => {
          if (hardwareBackHandler === handler) {
            hardwareBackHandler = null;
          }
        });
        return { remove: removeHardwareBackHandler };
      });
    modeNavV2Flag = jest.replaceProperty(
      FEATURE_FLAGS,
      'MODE_NAV_V2_ENABLED',
      true,
    );
  });

  afterEach(() => {
    addHardwareBackHandlerSpy.mockRestore();
    modeNavV2Flag.restore();
    if (originalPlatformOs) {
      Object.defineProperty(Platform, 'OS', originalPlatformOs);
    }
  });

  it('mounts the account admin sheet', () => {
    render(<AccountScreen />);

    screen.getByTestId('account-screen');
    screen.getByTestId('mock-account-admin-sheet');
  });

  it.each([
    ['mentor', '/(app)/mentor'],
    ['subjects', '/(app)/subjects'],
    ['journal', '/(app)/journal'],
    [undefined, '/(app)/mentor'],
  ] as const)(
    'uses the %s token as the empty-history V2 fallback',
    (returnTo, href) => {
      mockReturnTo = returnTo;
      render(<AccountScreen />);

      fireEvent.press(screen.getByTestId('account-back'));

      expect(mockRouter.replace).toHaveBeenCalledWith(href);
      expect(mockRouter.back).not.toHaveBeenCalled();
    },
  );

  it('preserves the legacy Home fallback when V2 is disabled', () => {
    modeNavV2Flag.replaceValue(false);
    mockReturnTo = 'journal';
    render(<AccountScreen />);

    fireEvent.press(screen.getByTestId('account-back'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/home');
  });

  it.each([
    ['mentor', 'Back to Mentor'],
    ['subjects', 'Back to Subjects'],
    ['journal', 'Back to Journal'],
  ] as const)(
    'names the exact %s destination in the Account return control',
    (returnTo, label) => {
      mockReturnTo = returnTo;
      render(<AccountScreen />);

      expect(screen.getByTestId('account-back').props.accessibilityLabel).toBe(
        label,
      );
    },
  );

  it.each(V2_RETURN_CASES)(
    'visible V2 Back: $name despite misleading native history',
    ({ returnTo, href }) => {
      mockRouter.canGoBack.mockReturnValue(true);
      mockReturnTo = returnTo;

      render(<AccountScreen />);

      fireEvent.press(screen.getByTestId('account-back'));

      expect(mockRouter.replace).toHaveBeenCalledWith(href);
      expect(mockRouter.back).not.toHaveBeenCalled();
    },
  );

  it.each(V2_RETURN_CASES)(
    'Android hardware Back: $name and consumes misleading history',
    ({ returnTo, href }) => {
      mockRouter.canGoBack.mockReturnValue(true);
      mockReturnTo = returnTo;

      render(<AccountScreen />);

      expect(hardwareBackHandler).toBeNull();
      expect(mockFocusEffectCallback).not.toBeNull();
      mockFocusEffectCallback?.();
      expect(hardwareBackHandler).not.toBeNull();
      expect(hardwareBackHandler?.()).toBe(true);
      expect(mockRouter.replace).toHaveBeenCalledWith(href);
      expect(mockRouter.back).not.toHaveBeenCalled();
    },
  );

  it('removes Account hardware Back ownership on blur so a Privacy leaf delegates Back to its stack', () => {
    render(<AccountScreen />);

    expect(mockFocusEffectCallback).not.toBeNull();
    const blurAccount = mockFocusEffectCallback?.();
    expect(typeof blurAccount).toBe('function');
    expect(hardwareBackHandler).not.toBeNull();

    blurAccount?.();

    expect(hardwareBackHandler).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(removeHardwareBackHandler).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'iOS V2',
      platform: 'ios',
      v2Enabled: true,
    },
    {
      name: 'web V2',
      platform: 'web',
      v2Enabled: true,
    },
    {
      name: 'Android legacy',
      platform: 'android',
      v2Enabled: false,
    },
  ] as const)(
    '$name installs no Account hardware Back ownership',
    ({ platform, v2Enabled }) => {
      setPlatformOs(platform);
      modeNavV2Flag.replaceValue(v2Enabled);

      render(<AccountScreen />);

      expect(mockFocusEffectCallback).not.toBeNull();
      expect(mockFocusEffectCallback?.()).toBeUndefined();
      expect(addHardwareBackHandlerSpy).not.toHaveBeenCalled();
      expect(hardwareBackHandler).toBeNull();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(mockRouter.back).not.toHaveBeenCalled();
    },
  );

  it('preserves native history Back for the legacy Account path', () => {
    modeNavV2Flag.replaceValue(false);
    mockRouter.canGoBack.mockReturnValue(true);

    render(<AccountScreen />);

    fireEvent.press(screen.getByTestId('account-back'));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
