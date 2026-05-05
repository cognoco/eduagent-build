import { fireEvent, render } from '@testing-library/react-native';
import { ArchivedTranscriptCard } from './archived-transcript-card';

describe('ArchivedTranscriptCard', () => {
  const props = {
    archivedAt: '2026-03-12T10:00:00Z',
    summary: {
      narrative:
        'Worked through long division and remainders for about 12 minutes together.',
      topicsCovered: ['long division', 'remainders'],
      sessionState: 'completed' as const,
      reEntryRecommendation:
        'Try a 4-digit dividend with a remainder next and talk through each step.',
      learnerRecap:
        'Today you connected division and remainders with solid progress.',
      topicId: null,
    },
    onContinueTopic: jest.fn(),
  };

  it('renders archived date in a friendly format', () => {
    const { getByText } = render(<ArchivedTranscriptCard {...props} />);
    expect(getByText(/archived on/i)).toBeTruthy();
    expect(getByText(/2026/i)).toBeTruthy();
  });

  it('renders topic chips for each topicsCovered entry', () => {
    const { getAllByTestId } = render(<ArchivedTranscriptCard {...props} />);
    expect(getAllByTestId('archived-topic-chip')).toHaveLength(2);
  });

  it('renders the re-entry recommendation', () => {
    const { getByText } = render(<ArchivedTranscriptCard {...props} />);
    expect(getByText(/4-digit dividend/i)).toBeTruthy();
  });

  it('calls onContinueTopic when CTA is pressed', () => {
    const { getByTestId } = render(<ArchivedTranscriptCard {...props} />);
    fireEvent.press(getByTestId('archived-continue-topic-cta'));
    expect(props.onContinueTopic).toHaveBeenCalledTimes(1);
  });
});
