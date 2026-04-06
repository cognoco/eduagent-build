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
});
