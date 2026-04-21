import { render, screen } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';
import {
  clearPendingAuthRedirect,
  rememberPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';

const mockUseGlobalSearchParams = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  Stack: ({ children }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="stack">{children}</View>;
  },
  useGlobalSearchParams: () => mockUseGlobalSearchParams(),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
}));

const AuthLayout = require('./_layout').default;

describe('AuthRoutesLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingAuthRedirect();
    mockReplace.mockReset();
    mockUseGlobalSearchParams.mockReturnValue({});
    mockUseLocalSearchParams.mockReturnValue({});
  });

  it('redirects to (app)/home when user is signed in', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    expect(screen.getByTestId('auth-redirecting')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('redirects signed-in users to the requested route when redirectTo is set', () => {
    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/quiz' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    expect(screen.getByTestId('auth-redirecting')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('keeps the requested route if auth search params clear during redirect', () => {
    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/quiz' });
    mockUseGlobalSearchParams.mockReturnValue({ redirectTo: '/quiz' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    const { rerender } = render(<AuthLayout />);
    expect(screen.getByTestId('stack')).toBeTruthy();

    mockUseLocalSearchParams.mockReturnValue({});
    mockUseGlobalSearchParams.mockReturnValue({});
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    rerender(<AuthLayout />);

    expect(screen.getByTestId('auth-redirecting')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('renders Stack when user is not signed in', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<AuthLayout />);

    expect(screen.getByTestId('stack')).toBeTruthy();
    expect(screen.queryByTestId('auth-redirecting')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('auth-redirecting')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
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

    expect(screen.getByTestId('auth-redirecting')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('normalizes route-group paths before redirecting signed-in users', () => {
    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/(app)/quiz' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    expect(screen.getByTestId('auth-redirecting')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('falls back to global params when local auth params are unavailable', () => {
    mockUseGlobalSearchParams.mockReturnValue({ redirectTo: '/quiz' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    expect(screen.getByTestId('auth-redirecting')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('falls back to the remembered app route when auth params are unavailable', () => {
    rememberPendingAuthRedirect('/(app)/quiz');
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    expect(screen.getByTestId('auth-redirecting')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
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
    expect(screen.queryByTestId('auth-redirecting')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
