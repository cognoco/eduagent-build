import { fireEvent, render, screen } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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
