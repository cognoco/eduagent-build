import { fireEvent, render, screen } from '@testing-library/react-native';
import { LibraryTabs } from './LibraryTabs';
import type { LibraryTab } from '../../lib/library-filters';

describe('LibraryTabs', () => {
  const defaultProps = {
    activeTab: 'shelves' as LibraryTab,
    onTabChange: jest.fn(),
    counts: { shelves: 4, books: 12, topics: 87 },
  };

  it('renders all three tabs and keeps topic label compact', () => {
    render(<LibraryTabs {...defaultProps} />);
    expect(screen.getByTestId('library-tab-shelves')).toBeTruthy();
    expect(screen.getByTestId('library-tab-books')).toBeTruthy();
    expect(screen.getByTestId('library-tab-topics')).toBeTruthy();
    expect(screen.getByText('Shelves (4)')).toBeTruthy();
    expect(screen.getByText('Books (12)')).toBeTruthy();
    expect(screen.getByText('Topics')).toBeTruthy();
    expect(screen.queryByText('Topics (87)')).toBeNull();
  });

  it('calls onTabChange when a tab is pressed', () => {
    const onTabChange = jest.fn();
    render(<LibraryTabs {...defaultProps} onTabChange={onTabChange} />);
    fireEvent.press(screen.getByTestId('library-tab-books'));
    expect(onTabChange).toHaveBeenCalledWith('books');
    fireEvent.press(screen.getByTestId('library-tab-topics'));
    expect(onTabChange).toHaveBeenCalledWith('topics');
  });

  it('shows zero counts', () => {
    render(
      <LibraryTabs
        activeTab="shelves"
        onTabChange={jest.fn()}
        counts={{ shelves: 0, books: 0, topics: 0 }}
      />
    );
    expect(screen.getByText('Shelves (0)')).toBeTruthy();
    expect(screen.getByText('Books (0)')).toBeTruthy();
    expect(screen.getByText('Topics')).toBeTruthy();
  });

  it('shows overdue review badge on the topics tab when provided', () => {
    render(<LibraryTabs {...defaultProps} reviewBadge={6} />);

    expect(screen.getByTestId('library-tab-topics-review-badge')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('sets accessibilityState selected on active tab', () => {
    render(<LibraryTabs {...defaultProps} activeTab="books" />);
    const booksTab = screen.getByTestId('library-tab-books');
    expect(booksTab.props.accessibilityState).toEqual({ selected: true });
    const shelvesTab = screen.getByTestId('library-tab-shelves');
    expect(shelvesTab.props.accessibilityState).toEqual({ selected: false });
  });
});
