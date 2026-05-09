import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccordionTopicList } from './AccordionTopicList';

const mockPush = jest.fn();
const mockUseChildSubjectTopics = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../hooks/use-dashboard', () => ({
  useChildSubjectTopics: (...args: unknown[]) =>
    mockUseChildSubjectTopics(...args),
}));

jest.mock('./RetentionSignal', () => {
  const { Text } = require('react-native');

  return {
    RetentionSignal: ({ status }: { status: string }) => (
      <Text testID={`retention-signal-${status}`}>{status}</Text>
    ),
  };
});

describe('AccordionTopicList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChildSubjectTopics.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('does not render content while collapsed and keeps the query disabled', () => {
    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded={false}
      />,
    );

    expect(screen.queryByText('No topics yet')).toBeNull();
    expect(mockUseChildSubjectTopics).toHaveBeenCalledWith(
      undefined,
      undefined,
    );
  });

  it('renders skeleton rows while loading after expansion', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
    );

    expect(screen.getAllByTestId('accordion-topic-skeleton')).toHaveLength(3);
    expect(mockUseChildSubjectTopics).toHaveBeenCalledWith(
      'child-1',
      'subject-1',
    );
  });

  it('shows a retry state when topic loading fails', () => {
    const refetch = jest.fn();
    mockUseChildSubjectTopics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
    );

    fireEvent.press(screen.getByTestId('accordion-topics-retry'));

    expect(
      screen.getByText(
        'Could not load topics. Tap to retry, or close the subject card to dismiss.',
      ),
    ).toBeTruthy();
    expect(refetch).toHaveBeenCalled();
  });

  it('renders topic labels and navigates to topic details', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [
        {
          topicId: 'topic-1',
          title: 'Fractions',
          description: 'Desc',
          completionStatus: 'in_progress',
          retentionStatus: 'fading',
          struggleStatus: 'normal',
          masteryScore: 0.4,
          summaryExcerpt: null,
          xpStatus: 'pending',
          totalSessions: 3,
        },
        {
          topicId: 'topic-2',
          title: 'Geometry',
          description: 'Desc',
          completionStatus: 'completed',
          retentionStatus: null,
          struggleStatus: 'normal',
          masteryScore: 0.8,
          summaryExcerpt: null,
          xpStatus: 'verified',
          totalSessions: 2,
        },
        {
          topicId: 'topic-3',
          title: 'Decimals',
          description: 'Desc',
          completionStatus: 'completed',
          retentionStatus: null,
          struggleStatus: 'normal',
          masteryScore: 0.7,
          summaryExcerpt: null,
          xpStatus: 'pending',
          totalSessions: 1,
        },
        {
          topicId: 'topic-4',
          title: 'Algebra',
          description: 'Desc',
          completionStatus: 'completed',
          retentionStatus: 'weak',
          struggleStatus: 'normal',
          masteryScore: 0.7,
          summaryExcerpt: null,
          xpStatus: 'decayed',
          totalSessions: 4,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
    );

    screen.getByText('Started');
    screen.getByText('Mastered');
    screen.getByText('Covered');
    screen.getByText('Needs review');
    screen.getByTestId('retention-signal-fading');

    fireEvent.press(screen.getByTestId('accordion-topic-topic-1'));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        pathname: '/(app)/child/[profileId]',
        params: { profileId: 'child-1' },
      }),
    );
    expect(mockPush).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        pathname: '/(app)/child/[profileId]/topic/[topicId]',
        params: expect.objectContaining({
          profileId: 'child-1',
          subjectId: 'subject-1',
          subjectName: 'Mathematics',
          topicId: 'topic-1',
          totalSessions: '3',
        }),
      }),
    );
  });

  it('renders an empty state when no topics are available', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
    );

    screen.getByText('No topics yet');
  });

  it('[UX-DE-M5] empty state shows Browse topics CTA that navigates to library', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="subject-1"
        subjectName="Mathematics"
        expanded
      />,
    );

    screen.getByTestId('accordion-topics-empty');
    screen.getByTestId('accordion-topics-browse');

    fireEvent.press(screen.getByTestId('accordion-topics-browse'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/library');
  });
});
