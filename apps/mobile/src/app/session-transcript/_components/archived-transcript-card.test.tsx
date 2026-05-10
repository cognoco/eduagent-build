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
      topicId: '018f0f08-6f40-7c3f-8a41-18f19d552f10',
    },
    onContinueTopic: jest.fn(),
    onBack: jest.fn(),
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

  it('hides the continue CTA when there is no resumable topic', () => {
    const { queryByTestId } = render(
      <ArchivedTranscriptCard
        {...props}
        summary={{ ...props.summary, topicId: null }}
      />,
    );
    expect(queryByTestId('archived-continue-topic-cta')).toBeNull();
  });

  it('does not render an empty covered-topics section', () => {
    const { queryByText, queryAllByTestId } = render(
      <ArchivedTranscriptCard
        {...props}
        summary={{
          ...props.summary,
          topicsCovered: [],
          sessionState: 'auto-closed',
        }}
      />,
    );
    expect(queryByText("Here's what you covered:")).toBeNull();
    expect(queryAllByTestId('archived-topic-chip')).toHaveLength(0);
  });

  it('calls onBack when the back affordance is pressed', () => {
    const { getByTestId } = render(<ArchivedTranscriptCard {...props} />);
    fireEvent.press(getByTestId('archived-transcript-back'));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
