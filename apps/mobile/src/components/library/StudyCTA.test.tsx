import { render, screen, fireEvent } from '@testing-library/react-native';
import { StudyCTA } from './StudyCTA';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    primary: '#0d9488',
    background: '#faf5ee',
    border: '#e8e0d4',
  }),
}));

describe('StudyCTA', () => {
  const onPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders label text', () => {
    render(
      <StudyCTA
        label="Start Study Session"
        variant="primary"
        onPress={onPress}
      />,
    );
    screen.getByText('Start Study Session');
  });

  it('defaults testID to study-cta', () => {
    render(<StudyCTA label="Study" variant="primary" onPress={onPress} />);
    expect(screen.getByTestId('study-cta')).toBeTruthy();
  });

  it('respects custom testID', () => {
    render(
      <StudyCTA
        label="Study"
        variant="primary"
        onPress={onPress}
        testID="custom-cta"
      />,
    );
    expect(screen.getByTestId('custom-cta')).toBeTruthy();
  });

  it('calls onPress when pressed (primary variant)', () => {
    render(<StudyCTA label="Study" variant="primary" onPress={onPress} />);
    fireEvent.press(screen.getByTestId('study-cta'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onPress when pressed (outline variant)', () => {
    render(<StudyCTA label="Continue" variant="outline" onPress={onPress} />);
    fireEvent.press(screen.getByTestId('study-cta'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    render(
      <StudyCTA label="Study" variant="primary" onPress={onPress} disabled />,
    );
    fireEvent.press(screen.getByTestId('study-cta'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('has accessibilityRole button', () => {
    render(<StudyCTA label="Study" variant="primary" onPress={onPress} />);
    const btn = screen.getByTestId('study-cta');
    expect(btn.props.accessibilityRole).toBe('button');
  });

  it('has accessibilityLabel matching label prop', () => {
    render(
      <StudyCTA
        label="Start Study Session"
        variant="primary"
        onPress={onPress}
      />,
    );
    const btn = screen.getByTestId('study-cta');
    expect(btn.props.accessibilityLabel).toBe('Start Study Session');
  });

  it('marks disabled state in accessibilityState', () => {
    render(
      <StudyCTA label="Study" variant="primary" onPress={onPress} disabled />,
    );
    const btn = screen.getByTestId('study-cta');
    expect(btn.props.accessibilityState).toEqual({ disabled: true });
  });
});
