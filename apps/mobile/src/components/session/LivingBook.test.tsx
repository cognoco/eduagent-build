import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { LivingBook } from './LivingBook';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#6366f1',
    textSecondary: '#9ca3af',
    warning: '#f59e0b',
  }),
}));

describe('LivingBook', () => {
  it('renders with zero exchanges (no counter text)', () => {
    render(
      <LivingBook exchangeCount={0} isComplete={false} persona="learner" />
    );

    expect(screen.getByTestId('living-book')).toBeTruthy();
    const counter = screen.getByTestId('living-book-counter');
    expect(counter.props.children).toBe('');
  });

  it('shows page count after exchanges', () => {
    render(
      <LivingBook exchangeCount={3} isComplete={false} persona="learner" />
    );

    const counter = screen.getByTestId('living-book-counter');
    expect(counter.props.children).toBe('3 pages');
  });

  it('shows singular "page" for count of 1', () => {
    render(
      <LivingBook exchangeCount={1} isComplete={false} persona="learner" />
    );

    const counter = screen.getByTestId('living-book-counter');
    expect(counter.props.children).toBe('1 page');
  });

  it('renders sparkle element for learner persona', () => {
    render(
      <LivingBook exchangeCount={2} isComplete={false} persona="learner" />
    );

    expect(screen.getByTestId('living-book-sparkle')).toBeTruthy();
  });

  it('does not render sparkle element for teen persona', () => {
    render(<LivingBook exchangeCount={2} isComplete={false} persona="teen" />);

    expect(screen.queryByTestId('living-book-sparkle')).toBeNull();
  });

  it('renders correctly in complete state', () => {
    render(
      <LivingBook exchangeCount={5} isComplete={true} persona="learner" />
    );

    expect(screen.getByTestId('living-book')).toBeTruthy();
    const counter = screen.getByTestId('living-book-counter');
    expect(counter.props.children).toBe('5 pages');
  });

  it('includes accessibility label with page count', () => {
    render(
      <LivingBook exchangeCount={3} isComplete={false} persona="learner" />
    );

    const book = screen.getByTestId('living-book');
    expect(book.props.accessibilityLabel).toBe('Book progress: 3 pages');
  });
});
