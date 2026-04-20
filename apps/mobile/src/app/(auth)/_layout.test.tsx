import { render, screen } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';

const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
  Stack: ({ children }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="stack">{children}</View>;
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

const AuthLayout = require('./_layout').default;

describe('AuthRoutesLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({});
  });

  it('redirects to (app)/home when user is signed in', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.children).toBe('/home');
  });

  it('redirects signed-in users to the requested route when redirectTo is set', () => {
    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/quiz' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.children).toBe('/quiz');
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
    expect(redirect.props.children).toBe('/home');
    expect(screen.queryByTestId('stack')).toBeNull();
  });

  it('ignores unsafe redirect targets and falls back to home', () => {
    mockUseLocalSearchParams.mockReturnValue({
      redirectTo: 'https://example.com/steal-session',
    });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.children).toBe('/(app)/home');
  });

  it('normalizes route-group paths before redirecting signed-in users', () => {
    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/(app)/quiz' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    const redirect = screen.getByTestId('redirect');
    expect(redirect.props.children).toBe('/quiz');
  });

  it('renders nothing when isLoaded is false (Clerk still initializing)', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });

    const { toJSON } = render(<AuthLayout />);

    // Should render nothing — Clerk hasn't determined auth state yet.
    // Rendering the Stack would flash sign-in for already-signed-in users.
    // Rendering a Redirect would send users to the wrong place.
    expect(toJSON()).toBeNull();
    expect(screen.queryByTestId('stack')).toBeNull();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });
});
