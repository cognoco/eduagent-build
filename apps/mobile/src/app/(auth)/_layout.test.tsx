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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to (app)/home when user is signed in', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.children).toBe('/(app)/home');
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

  // ---------------------------------------------------------------------------
  // Reactive navigation guard — regression for navigation race condition.
  //
  // Auth screens call Clerk setActive() after sign-in but must NOT navigate
  // explicitly.  Instead, this layout re-renders when useAuth().isSignedIn
  // flips to true and emits the <Redirect>.  These tests prove the guard
  // fires reactively on state transition, which is the mechanism that
  // replaced the racy router.replace() calls.
  // ---------------------------------------------------------------------------

  it('redirects to home when isSignedIn transitions from false → true', () => {
    // Start signed out — the auth form is visible
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    const { rerender } = render(<AuthLayout />);
    expect(screen.getByTestId('stack')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();

    // Clerk processes setActive() → isSignedIn flips to true on next render
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    rerender(<AuthLayout />);

    // Guard fires → user lands in app home
    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.children).toBe('/(app)/home');
    expect(screen.queryByTestId('stack')).toBeNull();
  });

  it('stays on auth screen when isLoaded is false (Clerk still initializing)', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });

    render(<AuthLayout />);

    // Should render auth routes, not redirect — Clerk hasn't determined
    // auth state yet.  Redirecting here would flash the sign-in screen
    // for already-signed-in users.
    expect(screen.getByTestId('stack')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });
});
