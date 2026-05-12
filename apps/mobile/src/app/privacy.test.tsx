import { fireEvent, render, screen } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () =>
  // native-boundary
  require('../test-utils/native-shims').expoRouterShim({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
);

jest.mock('react-native-safe-area-context', () =>
  // native-boundary
  require('../test-utils/native-shims').safeAreaShim(),
);

jest.mock('../lib/theme', () => ({
  useThemeColors: () => ({ textPrimary: '#111111' }),
}));

const PrivacyPolicyScreen = require('./privacy').default;

describe('PrivacyPolicyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('back button calls router.back() when history exists', () => {
    render(<PrivacyPolicyScreen />);

    fireEvent.press(screen.getByTestId('back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('back button replaces more when there is no history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<PrivacyPolicyScreen />);

    fireEvent.press(screen.getByTestId('back-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
  });
});
