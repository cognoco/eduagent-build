import { fireEvent, render, screen } from '@testing-library/react-native';
import { LibraryEmptyState } from './LibraryEmptyState';

describe('LibraryEmptyState', () => {
  it('shows no-results message with clear button', () => {
    const onClear = jest.fn();
    render(
      <LibraryEmptyState
        variant="no-results"
        entityName="books"
        onClear={onClear}
      />
    );
    expect(screen.getByText('No books match your search')).toBeTruthy();
    expect(screen.getByTestId('library-clear-search')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows custom clear label when provided', () => {
    render(
      <LibraryEmptyState
        variant="no-results"
        entityName="topics"
        onClear={jest.fn()}
        clearLabel="Clear all"
      />
    );
    expect(screen.getByText('Clear all')).toBeTruthy();
  });

  it('defaults clear label to "Clear search"', () => {
    render(
      <LibraryEmptyState
        variant="no-results"
        entityName="shelves"
        onClear={jest.fn()}
      />
    );
    expect(screen.getByText('Clear search')).toBeTruthy();
  });

  it('shows no-content message with add subject button', () => {
    const onAddSubject = jest.fn();
    render(
      <LibraryEmptyState variant="no-content" onAddSubject={onAddSubject} />
    );
    expect(
      screen.getByText('Add a subject to start building your library')
    ).toBeTruthy();
    expect(screen.getByTestId('library-add-subject-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-add-subject-empty'));
    expect(onAddSubject).toHaveBeenCalledTimes(1);
  });
});
