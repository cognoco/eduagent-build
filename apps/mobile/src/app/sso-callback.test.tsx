import { render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

const WebBrowser = require('expo-web-browser');
const SSOCallbackScreen = require('./sso-callback').default;

describe('SSOCallbackScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading indicator and text', () => {
    render(<SSOCallbackScreen />);

    screen.getByText('Finishing sign-in...');
  });

  it('calls maybeCompleteAuthSession unconditionally on mount [BUG-261]', () => {
    render(<SSOCallbackScreen />);

    expect(WebBrowser.maybeCompleteAuthSession).toHaveBeenCalledTimes(1);
  });
});
