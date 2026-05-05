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
          name: 'emerald',
          solid: '#047857',
          soft: 'rgba(4,120,87,0.14)',
        }}
        onPress={jest.fn()}
      />
    );

    const card = screen.getByTestId('book-card-book-1');
    const icon = screen.getByTestId('book-card-icon-book-1');

    expect(card.props.style).toEqual(
      expect.objectContaining({
        borderColor: 'rgba(4,120,87,0.14)',
        borderWidth: 1,
      })
    );
    expect(icon.props.style).toEqual(
      expect.objectContaining({
        backgroundColor: 'rgba(4,120,87,0.14)',
        borderColor: '#047857',
        borderWidth: 1,
      })
    );
  });
});
