import { render } from '@testing-library/react-native';
import { NoteDisplay } from './NoteDisplay';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textSecondary: '#999',
    primary: '#00bcd4',
    error: '#f44',
    warning: '#ff9800',
    success: '#4caf50',
  }),
}));

describe('NoteDisplay', () => {
  it('shows note content', () => {
    const { getByText } = render(
      <NoteDisplay
        content="Pyramids are tombs for pharaohs"
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(getByText('Pyramids are tombs for pharaohs')).toBeTruthy();
  });

  it('shows edit and delete buttons', () => {
    const { getByTestId } = render(
      <NoteDisplay
        content="Some note"
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(getByTestId('note-edit-button')).toBeTruthy();
    expect(getByTestId('note-delete-button')).toBeTruthy();
  });

  it('hides edit/delete in read-only mode', () => {
    const { queryByTestId } = render(
      <NoteDisplay content="Some note" readOnly />
    );
    expect(queryByTestId('note-edit-button')).toBeNull();
    expect(queryByTestId('note-delete-button')).toBeNull();
  });

  it('renders session separators as visual dividers', () => {
    const content = 'First note\n--- Apr 5 ---\nSecond note';
    const { getByText } = render(<NoteDisplay content={content} readOnly />);
    expect(getByText('Apr 5')).toBeTruthy();
  });

  // [a11y sweep] Break tests: edit/delete icon wrappers must be a11y-hidden
  // so VoiceOver/TalkBack only announces the Pressable label, not the icon name.
  it('marks the edit icon wrapper as accessibility-hidden [a11y sweep]', () => {
    const { getByTestId } = render(
      <NoteDisplay
        content="Test note"
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    const iconWrapper = getByTestId('note-edit-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
  });

  it('edit icon is excluded from default visible-only queries [a11y sweep]', () => {
    const { queryByTestId } = render(
      <NoteDisplay
        content="Test note"
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    expect(queryByTestId('note-edit-icon')).toBeNull();
  });

  it('marks the delete icon wrapper as accessibility-hidden [a11y sweep]', () => {
    const { getByTestId } = render(
      <NoteDisplay
        content="Test note"
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    const iconWrapper = getByTestId('note-delete-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
  });
});
