import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeContext } from '../../lib/theme';
import { LibrarySearchBar } from './LibrarySearchBar';

// renderWithTheme is only needed when a test asserts theme-derived style props.
function renderWithTheme(ui: Parameters<typeof render>[0]) {
  return render(
    <ThemeContext.Provider
      value={{
        colorScheme: 'light',
        setColorScheme: jest.fn(),
        accentPresetId: null,
        setAccentPresetId: jest.fn(),
      }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

describe('LibrarySearchBar', () => {
  it('renders with placeholder', () => {
    renderWithTheme(
      <LibrarySearchBar
        value=""
        onChangeText={jest.fn()}
        placeholder="Search shelves..."
      />,
    );
    screen.getByTestId('library-search-input');
    expect(screen.getByPlaceholderText('Search shelves...')).toBeTruthy();
  });

  it('calls onChangeText when typing', () => {
    const onChangeText = jest.fn();
    renderWithTheme(
      <LibrarySearchBar
        value=""
        onChangeText={onChangeText}
        placeholder="Search..."
      />,
    );
    fireEvent.changeText(screen.getByTestId('library-search-input'), 'math');
    expect(onChangeText).toHaveBeenCalledWith('math');
  });

  it('shows clear button when value is non-empty and clears on press', () => {
    const onChangeText = jest.fn();
    renderWithTheme(
      <LibrarySearchBar
        value="math"
        onChangeText={onChangeText}
        placeholder="Search..."
      />,
    );
    screen.getByTestId('library-search-clear');
    fireEvent.press(screen.getByTestId('library-search-clear'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('hides clear button when value is empty', () => {
    renderWithTheme(
      <LibrarySearchBar
        value=""
        onChangeText={jest.fn()}
        placeholder="Search..."
      />,
    );
    expect(screen.queryByTestId('library-search-clear')).toBeNull();
  });

  // [a11y sweep] Break tests: the clear-search icon must be a11y-hidden —
  // the Pressable accessibilityLabel "Clear search" already conveys the action.
  it('marks the clear icon wrapper as accessibility-hidden [a11y sweep]', () => {
    const { getByTestId } = renderWithTheme(
      <LibrarySearchBar
        value="math"
        onChangeText={jest.fn()}
        placeholder="Search..."
      />,
    );
    const iconWrapper = getByTestId('library-search-clear-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
  });

  it('clear icon is excluded from default visible-only queries [a11y sweep]', () => {
    const { queryByTestId } = renderWithTheme(
      <LibrarySearchBar
        value="math"
        onChangeText={jest.fn()}
        placeholder="Search..."
      />,
    );
    expect(queryByTestId('library-search-clear-icon')).toBeNull();
  });
});
