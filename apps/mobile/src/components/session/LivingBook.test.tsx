import { render, screen } from '@testing-library/react-native';
import { LivingBook } from './LivingBook';

jest.mock('../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    primary: '#6366f1',
    textSecondary: '#9ca3af',
    warning: '#f59e0b',
  }),
}));

describe('LivingBook', () => {
  it('renders with zero exchanges (no counter text)', () => {
    render(<LivingBook exchangeCount={0} isComplete={false} isExpressive />);

    screen.getByTestId('living-book');
    const counter = screen.getByTestId('living-book-counter');
    expect(counter.props.children).toBe('');
  });

  it('shows page count after exchanges', () => {
    render(<LivingBook exchangeCount={3} isComplete={false} isExpressive />);

    const counter = screen.getByTestId('living-book-counter');
    expect(counter.props.children).toBe('3 pages');
  });

  it('shows singular "page" for count of 1', () => {
    render(<LivingBook exchangeCount={1} isComplete={false} isExpressive />);

    const counter = screen.getByTestId('living-book-counter');
    expect(counter.props.children).toBe('1 page');
  });

  it('renders sparkle element when isExpressive is true', () => {
    render(<LivingBook exchangeCount={2} isComplete={false} isExpressive />);

    screen.getByTestId('living-book-sparkle');
  });

  it('does not render sparkle element when isExpressive is false', () => {
    render(<LivingBook exchangeCount={2} isComplete={false} />);

    expect(screen.queryByTestId('living-book-sparkle')).toBeNull();
  });

  it('renders correctly in complete state', () => {
    render(<LivingBook exchangeCount={5} isComplete={true} isExpressive />);

    screen.getByTestId('living-book');
    const counter = screen.getByTestId('living-book-counter');
    expect(counter.props.children).toBe('5 pages');
  });

  it('includes accessibility label with page count', () => {
    render(<LivingBook exchangeCount={3} isComplete={false} isExpressive />);

    const book = screen.getByTestId('living-book');
    expect(book.props.accessibilityLabel).toBe('Book progress: 3 pages');
  });
});
