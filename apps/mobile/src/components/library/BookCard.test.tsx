import { render, screen } from '@testing-library/react-native';
import type { CurriculumBook } from '@eduagent/schemas';
import { BookCard } from './BookCard';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  '../../lib/theme' /* gc1-allow: unit test supplies semantic colors without native theme context */,
  () => ({
    useThemeColors: () => ({
      primary: '#2563eb',
    }),
  }),
);

const book = {
  id: 'book-1',
  title: 'Life Sciences',
  description: 'Living things, ecosystems, and the human body',
  emoji: '📘',
  topicsGenerated: true,
  topicCount: 5,
  completedTopicCount: 3,
  masteredTopicCount: 2,
  masteredAt: null,
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

  it('renders mastered and learning progress as separate segments', () => {
    render(
      <BookCard
        book={book}
        status="IN_PROGRESS"
        tint={{
          name: 'rose',
          solid: '#db2777',
          soft: 'rgba(219,39,119,0.14)',
        }}
        onPress={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('book-card-progress-mastered-book-1').props.style,
    ).toEqual(
      expect.objectContaining({
        backgroundColor: '#db2777',
        width: '40%',
      }),
    );
    expect(
      screen.getByTestId('book-card-progress-learning-book-1').props.style,
    ).toEqual(
      expect.objectContaining({
        width: '20%',
      }),
    );
  });

  it('shows mastered and review-ready labels independently', () => {
    render(
      <BookCard
        book={{ ...book, masteredAt: '2026-05-30T00:00:00.000Z' }}
        status="REVIEW_DUE"
        onPress={jest.fn()}
      />,
    );

    screen.getByText('Mastered');
    screen.getByText('Review due');
    screen.getByText('Review ready');
  });
});
