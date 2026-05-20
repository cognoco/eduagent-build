import { render, screen } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  Stack: ({ children }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="stack">{children}</View>;
  },
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: jest.fn(),
}));

const PreviewLayout = require('./_layout').default;

describe('PreviewLayout auth guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReplace.mockReset();
  });

  it('renders nothing while Clerk is still loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });

    const { toJSON } = render(<PreviewLayout />);

    expect(toJSON()).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders the preview Stack when the user is signed out', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<PreviewLayout />);

    screen.getByTestId('stack');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects signed-in users away from preview routes', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<PreviewLayout />);

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    expect(screen.queryByTestId('stack')).toBeNull();
  });

  it('redirects when isSignedIn flips false to true mid-flow', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    const { rerender } = render(<PreviewLayout />);
    screen.getByTestId('stack');
    expect(mockReplace).not.toHaveBeenCalled();

    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    rerender(<PreviewLayout />);

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    expect(screen.queryByTestId('stack')).toBeNull();
  });
});
