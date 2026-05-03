import { fireEvent, render, screen } from '@testing-library/react-native';
import { LibraryTabs } from './LibraryTabs';
import type { LibraryTab } from '../../lib/library-filters';

describe('LibraryTabs', () => {
  const defaultProps = {
    activeTab: 'shelves' as LibraryTab,
    onTabChange: jest.fn(),
    counts: { shelves: 4, books: 12, topics: 87 },
  };

  it('renders Shelves and Books tabs with count badges', () => {
    render(<LibraryTabs {...defaultProps} />);
    screen.getByTestId('library-tab-shelves');
    screen.getByTestId('library-tab-books');
    screen.getByText('Shelves (4)');
    screen.getByText('Books (12)');
  });

  it('hides the Topics tab from top-level Library navigation', () => {
    render(<LibraryTabs {...defaultProps} />);
    expect(screen.queryByTestId('library-tab-topics')).toBeNull();
    expect(screen.queryByText(/^Topics \(/)).toBeNull();
  });

  it('calls onTabChange when a tab is pressed', () => {
    const onTabChange = jest.fn();
    render(<LibraryTabs {...defaultProps} onTabChange={onTabChange} />);
    fireEvent.press(screen.getByTestId('library-tab-books'));
    expect(onTabChange).toHaveBeenCalledWith('books');
  });

  it('shows zero counts', () => {
    render(
      <LibraryTabs
        activeTab="shelves"
        onTabChange={jest.fn()}
        counts={{ shelves: 0, books: 0, topics: 0 }}
      />
    );
    screen.getByText('Shelves (0)');
    screen.getByText('Books (0)');
  });

  it('does not render the overdue review badge (Topics tab is hidden)', () => {
    render(<LibraryTabs {...defaultProps} reviewBadge={6} />);

    expect(screen.queryByTestId('library-tab-topics-review-badge')).toBeNull();
  });

  it('sets accessibilityState selected on active tab', () => {
    render(<LibraryTabs {...defaultProps} activeTab="books" />);
    const booksTab = screen.getByTestId('library-tab-books');
    expect(booksTab.props.accessibilityState).toEqual({ selected: true });
    const shelvesTab = screen.getByTestId('library-tab-shelves');
    expect(shelvesTab.props.accessibilityState).toEqual({ selected: false });
  });
});
