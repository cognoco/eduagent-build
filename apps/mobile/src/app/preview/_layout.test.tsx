import { render, screen } from '@testing-library/react-native';
import { useAuth } from '@clerk/expo';

jest.mock('expo-router', () => ({
  Stack: ({ children }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="stack">{children}</View>;
  },
  Redirect: ({ href }: { href: string }) => {
    const { View } = require('react-native');
    return <View testID={`redirect-${href}`} />;
  },
}));

jest.mock('@clerk/expo', () => ({
  useAuth: jest.fn(),
}));

const PreviewLayout = require('./_layout').default;

describe('PreviewLayout auth guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing while Clerk is still loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });

    const { toJSON } = render(<PreviewLayout />);

    expect(toJSON()).toBeNull();
  });

  it('renders the preview Stack when the user is signed out', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<PreviewLayout />);

    screen.getByTestId('stack');
    expect(screen.queryByTestId('redirect-/(app)/home')).toBeNull();
  });

  it('renders Redirect for signed-in users instead of Stack', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<PreviewLayout />);

    screen.getByTestId('redirect-/(app)/home');
    expect(screen.queryByTestId('stack')).toBeNull();
  });

  it('switches to Redirect when isSignedIn flips false to true mid-flow', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    const { rerender } = render(<PreviewLayout />);
    screen.getByTestId('stack');
    expect(screen.queryByTestId('redirect-/(app)/home')).toBeNull();

    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    rerender(<PreviewLayout />);

    screen.getByTestId('redirect-/(app)/home');
    expect(screen.queryByTestId('stack')).toBeNull();
  });
});
