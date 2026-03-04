import { render } from '@testing-library/react-native';
import { OfflineBanner } from './OfflineBanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ background: '#ffffff' }),
}));

describe('OfflineBanner', () => {
  it('renders the offline message', () => {
    const { getByText } = render(<OfflineBanner />);
    expect(getByText('No internet connection')).toBeTruthy();
  });

  it('has testID for integration tests', () => {
    const { getByTestId } = render(<OfflineBanner />);
    expect(getByTestId('offline-banner')).toBeTruthy();
  });

  it('has alert accessibility role', () => {
    const { getByTestId } = render(<OfflineBanner />);
    expect(getByTestId('offline-banner').props.accessibilityRole).toBe('alert');
  });

  it('has assertive live region for screen readers', () => {
    const { getByTestId } = render(<OfflineBanner />);
    expect(getByTestId('offline-banner').props.accessibilityLiveRegion).toBe(
      'assertive'
    );
  });
});
