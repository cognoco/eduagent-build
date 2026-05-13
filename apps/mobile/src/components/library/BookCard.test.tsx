import { render, screen } from '@testing-library/react-native';
import type { CurriculumBook } from '@eduagent/schemas';
import { BookCard } from './BookCard';

const book = {
  id: 'book-1',
  title: 'Life Sciences',
  description: 'Living things, ecosystems, and the human body',
  emoji: '📘',
  topicsGenerated: true,
} as CurriculumBook;

describe('BookCard', () => {
  it('uses subject tint for the book icon and card border', () => {
    render(
      <BookCard
        book={book}
        status="NOT_STARTED"
        tint={{
          name: 'rose',
          solid: '#db2777',
          soft: 'rgba(219,39,119,0.14)',
        }}
        onPress={jest.fn()}
      />,
    );

    const card = screen.getByTestId('book-card-book-1');
    const icon = screen.getByTestId('book-card-icon-book-1');

    expect(card.props.style).toEqual(
      expect.objectContaining({
        borderColor: 'rgba(219,39,119,0.14)',
        borderWidth: 1,
      }),
    );
    expect(icon.props.style).toEqual(
      expect.objectContaining({
        backgroundColor: 'rgba(219,39,119,0.14)',
        borderColor: '#db2777',
        borderWidth: 1,
      }),
    );
  });
});
