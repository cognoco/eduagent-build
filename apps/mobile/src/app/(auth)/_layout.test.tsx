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

// prettier-ignore
jest.mock('../../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useThemeColors: () => ({ accent: '#0ea5e9', background: '#18181b', border: '#d4d4d8', muted: '#71717a', surface: '#ffffff', textInverse: '#ffffff', textPrimary: '#18181b', textSecondary: '#52525b' }),
  useTheme: () => ({ colorScheme: 'dark' }),
  useTokenVars: () => ({}),
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

    screen.getByTestId('auth-redirecting');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('redirects signed-in users to the requested route when redirectTo is set', () => {
    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/quiz' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    screen.getByTestId('auth-redirecting');
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
    screen.getByTestId('stack');

    mockUseLocalSearchParams.mockReturnValue({});
    mockUseGlobalSearchParams.mockReturnValue({});
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    rerender(<AuthLayout />);

    screen.getByTestId('auth-redirecting');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('renders Stack when user is not signed in', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<AuthLayout />);

    screen.getByTestId('stack');
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
    screen.getByTestId('stack');
    expect(screen.queryByTestId('redirect')).toBeNull();

    // Clerk processes setActive() → isSignedIn flips to true on next render
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    rerender(<AuthLayout />);

    // Guard fires → user lands in app home
    screen.getByTestId('auth-redirecting');
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

    screen.getByTestId('auth-redirecting');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('normalizes route-group paths before redirecting signed-in users', () => {
    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/(app)/quiz' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    screen.getByTestId('auth-redirecting');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('falls back to global params when local auth params are unavailable', () => {
    mockUseGlobalSearchParams.mockReturnValue({ redirectTo: '/quiz' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    screen.getByTestId('auth-redirecting');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  it('falls back to the remembered app route when auth params are unavailable', () => {
    rememberPendingAuthRedirect('/(app)/quiz');
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<AuthLayout />);

    screen.getByTestId('auth-redirecting');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz');
  });

  // ---------------------------------------------------------------------------
  // BUG-506 regression — deep-link redirect target changes while already signed in.
  //
  // Before the fix: redirectTargetRef.current was mutated during render but was
  // NOT in the effect deps. A new deep-link arriving after sign-in would update
  // the ref silently; the effect never re-ran; router.replace was never called
  // with the new target.
  //
  // After the fix: effectiveTarget state mirrors redirectTargetRef.current and
  // is included in the effect deps. Changing the param → state update → effect
  // re-runs → correct router.replace.
  // ---------------------------------------------------------------------------

  it('[BUG-506] re-redirects when redirectTo param changes while already signed in', () => {
    // Start: signed-in user arrives at /(auth)/sign-in?redirectTo=/foo
    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/foo' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    const { rerender } = render(<AuthLayout />);

    // First redirect must fire
    expect(mockReplace).toHaveBeenCalledWith('/(app)/foo');
    mockReplace.mockClear();

    // A freshly-arrived deep-link updates the redirectTo param to /bar
    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/bar' });

    rerender(<AuthLayout />);

    // Effect must re-run with the new target — this was the broken path
    expect(mockReplace).toHaveBeenCalledWith('/(app)/bar');
  });

  it('[F-175] rememberPendingAuthRedirect is NOT called on every re-render (render-phase side-effect bug)', () => {
    // The bug: the if (redirectTarget) block in _layout.tsx calls
    // rememberPendingAuthRedirect (storage write) during the render phase.
    // The fix moves it to a useEffect. A useEffect only fires when its deps
    // change; a render-phase call fires on every render.
    //
    // Test logic: render once (call count = N), rerender with same params
    // (deps unchanged), assert call count is still N — i.e., the storage
    // write did NOT re-fire on the second render.
    const rememberMock = jest.spyOn(
      require('../../lib/pending-auth-redirect'),
      'rememberPendingAuthRedirect',
    );
    rememberMock.mockReturnValue('/(app)/foo');

    mockUseLocalSearchParams.mockReturnValue({ redirectTo: '/foo' });
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
    });

    const { rerender } = render(<AuthLayout />);
    const callsAfterFirstRender = rememberMock.mock.calls.length;

    // Rerender with identical params — deps unchanged.
    rerender(<AuthLayout />);
    const callsAfterSameParamRerender = rememberMock.mock.calls.length;

    // With the fix: useEffect deps haven't changed → NOT re-called.
    // With the bug: render-phase block fires on every render → count increases.
    expect(callsAfterSameParamRerender).toBe(callsAfterFirstRender);

    rememberMock.mockRestore();
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
