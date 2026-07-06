import { fireEvent, render, screen } from '@testing-library/react-native';

import AccountScreen from './index';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockGoBackOrReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 12, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../../../components/account/AccountAdminSheet', () => ({
  AccountAdminSheet: () => {
    const { Text } = require('react-native');
    return <Text testID="mock-account-admin-sheet" />;
  },
}));

jest.mock(
  '../../../lib/navigation' /* gc1-allow: route wrapper test captures goBackOrReplace fallback without native navigation context */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

describe('AccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mounts the account admin sheet', () => {
    render(<AccountScreen />);

    screen.getByTestId('account-screen');
    screen.getByTestId('mock-account-admin-sheet');
  });

  it('uses the navigation fallback for the back affordance', () => {
    render(<AccountScreen />);

    fireEvent.press(screen.getByTestId('account-back'));

    expect(mockGoBackOrReplace).toHaveBeenCalledWith(mockRouter, '/(app)/home');
  });
});
