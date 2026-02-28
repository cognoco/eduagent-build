import { render, screen } from '@testing-library/react-native';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

const SSOCallbackScreen = require('./sso-callback').default;

describe('SSOCallbackScreen', () => {
  it('renders loading indicator and text', () => {
    render(<SSOCallbackScreen />);

    expect(screen.getByText('Finishing sign-in...')).toBeTruthy();
  });
});
