import { fireEvent, render, screen } from '@testing-library/react-native';

import AccountScreen from './index';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
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
  });

  it('mounts the account admin sheet', () => {
    render(<AccountScreen />);

    screen.getByTestId('account-screen');
    screen.getByTestId('mock-account-admin-sheet');
  });

  it('uses the navigation fallback for the back affordance', () => {
    render(<AccountScreen />);

    fireEvent.press(screen.getByTestId('account-back'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/home');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('uses native back when the router can go back', () => {
    mockRouter.canGoBack.mockReturnValue(true);

    render(<AccountScreen />);

    fireEvent.press(screen.getByTestId('account-back'));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
