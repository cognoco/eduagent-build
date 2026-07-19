import { fireEvent, render, screen } from '@testing-library/react-native';

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

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ returnTo: mockReturnTo }),
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
    modeNavV2Flag = jest.replaceProperty(
      FEATURE_FLAGS,
      'MODE_NAV_V2_ENABLED',
      true,
    );
  });

  afterEach(() => {
    modeNavV2Flag.restore();
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

  it('uses native back when the router can go back', () => {
    mockRouter.canGoBack.mockReturnValue(true);

    render(<AccountScreen />);

    fireEvent.press(screen.getByTestId('account-back'));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
