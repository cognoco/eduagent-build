import { render, screen } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
  Stack: ({ children }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="stack">{children}</View>;
  },
}));

const AuthLayout = require('./_layout').default;

describe('AuthRoutesLayout', () => {
  it('redirects to (learner)/home when user is signed in', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.children).toBe('/(learner)/home');
  });

  it('renders Stack when user is not signed in', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<AuthLayout />);

    expect(screen.getByTestId('stack')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });
});
