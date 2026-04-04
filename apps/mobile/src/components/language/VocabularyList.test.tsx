import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Vocabulary } from '@eduagent/schemas';
import { VocabularyList } from './VocabularyList';

const ITEMS: Vocabulary[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    profileId: '660e8400-e29b-41d4-a716-446655440000',
    subjectId: '770e8400-e29b-41d4-a716-446655440000',
    term: 'buenos dias',
    termNormalized: 'buenos dias',
    translation: 'good morning',
    type: 'chunk',
    cefrLevel: 'A1',
    milestoneId: null,
    mastered: false,
    createdAt: '2026-04-04T12:00:00.000Z',
    updatedAt: '2026-04-04T12:00:00.000Z',
  },
];

describe('VocabularyList', () => {
  it('renders vocabulary items', () => {
    render(<VocabularyList items={ITEMS} />);
    expect(screen.getByText('buenos dias')).toBeTruthy();
    expect(screen.getByText('good morning')).toBeTruthy();
    expect(screen.getByText(/Chunk/)).toBeTruthy();
  });

  it('calls onReview when review button is pressed', () => {
    const onReview = jest.fn();
    render(<VocabularyList items={ITEMS} onReview={onReview} />);
    fireEvent.press(screen.getByText('Review'));
    expect(onReview).toHaveBeenCalledWith(ITEMS[0]);
  });
});
