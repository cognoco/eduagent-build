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
    screen.getByText('No books match your search');
    screen.getByTestId('library-clear-search');
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
    screen.getByText('Clear all');
  });

  it('defaults clear label to "Clear search"', () => {
    render(
      <LibraryEmptyState
        variant="no-results"
        entityName="shelves"
        onClear={jest.fn()}
      />
    );
    screen.getByText('Clear search');
  });

  it('shows no-content message with add subject button', () => {
    const onAddSubject = jest.fn();
    render(
      <LibraryEmptyState variant="no-content" onAddSubject={onAddSubject} />
    );
    expect(
      screen.getByText('Add a subject to start building your library')
    ).toBeTruthy();
    screen.getByTestId('library-add-subject-empty');
    fireEvent.press(screen.getByTestId('library-add-subject-empty'));
    expect(onAddSubject).toHaveBeenCalledTimes(1);
  });
});
