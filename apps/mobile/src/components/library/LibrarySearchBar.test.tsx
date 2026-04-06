import { fireEvent, render, screen } from '@testing-library/react-native';
import { LibrarySearchBar } from './LibrarySearchBar';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textSecondary: '#525252',
    muted: '#a3a3a3',
  }),
}));

describe('LibrarySearchBar', () => {
  it('renders with placeholder', () => {
    render(
      <LibrarySearchBar
        value=""
        onChangeText={jest.fn()}
        placeholder="Search shelves..."
      />
    );
    expect(screen.getByTestId('library-search-input')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search shelves...')).toBeTruthy();
  });

  it('calls onChangeText when typing', () => {
    const onChangeText = jest.fn();
    render(
      <LibrarySearchBar
        value=""
        onChangeText={onChangeText}
        placeholder="Search..."
      />
    );
    fireEvent.changeText(screen.getByTestId('library-search-input'), 'math');
    expect(onChangeText).toHaveBeenCalledWith('math');
  });

  it('shows clear button when value is non-empty and clears on press', () => {
    const onChangeText = jest.fn();
    render(
      <LibrarySearchBar
        value="math"
        onChangeText={onChangeText}
        placeholder="Search..."
      />
    );
    expect(screen.getByTestId('library-search-clear')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-search-clear'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('hides clear button when value is empty', () => {
    render(
      <LibrarySearchBar
        value=""
        onChangeText={jest.fn()}
        placeholder="Search..."
      />
    );
    expect(screen.queryByTestId('library-search-clear')).toBeNull();
  });
});
