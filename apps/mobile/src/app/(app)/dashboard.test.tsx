import { render } from '@testing-library/react-native';

import DashboardRedirect from './dashboard';

const mockUseLocalSearchParams = jest.fn();
const mockRedirect = jest.fn(({ href }) => null);

jest.mock('expo-router', () => ({
  Redirect: (props: { href: unknown }) => {
    mockRedirect(props);
    return null;
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

describe('DashboardRedirect (legacy /dashboard route)', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReset();
    mockRedirect.mockReset();
  });

  it('redirects to /(app)/family when no returnTo is provided', () => {
    mockUseLocalSearchParams.mockReturnValue({});

    render(<DashboardRedirect />);

    expect(mockRedirect).toHaveBeenCalledWith({ href: '/(app)/family' });
  });

  it('preserves a string returnTo param', () => {
    mockUseLocalSearchParams.mockReturnValue({ returnTo: 'home' });

    render(<DashboardRedirect />);

    expect(mockRedirect).toHaveBeenCalledWith({
      href: { pathname: '/(app)/family', params: { returnTo: 'home' } },
    });
  });

  it('uses the first element when returnTo arrives as an array', () => {
    mockUseLocalSearchParams.mockReturnValue({ returnTo: ['more', 'extra'] });

    render(<DashboardRedirect />);

    expect(mockRedirect).toHaveBeenCalledWith({
      href: { pathname: '/(app)/family', params: { returnTo: 'more' } },
    });
  });
});
