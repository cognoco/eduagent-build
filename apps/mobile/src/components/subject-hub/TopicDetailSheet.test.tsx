import type { CurriculumTopic } from '@eduagent/schemas';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { HubTopic } from './_view-models/subject-hub-state';
import { TopicDetailSheet } from './TopicDetailSheet';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function hubTopic(description: string | null): HubTopic {
  return {
    topic: {
      id: 'topic-1',
      title: 'Photosynthesis',
      description: description ?? '',
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 20,
      bookId: 'book-1',
      chapter: 'Biology',
      skipped: false,
    } as CurriculumTopic,
    state: 'mastered',
    sessionCount: 2,
  };
}

describe('TopicDetailSheet', () => {
  it('renders title, description before mastery, notes, and study actions', () => {
    render(
      <TopicDetailSheet
        topic={hubTopic('Photosynthesis turns light into sugar.')}
        notes={[
          {
            id: 'note-1',
            topicId: 'topic-1',
            content: 'Chlorophyll absorbs light.',
            origin: 'self',
            authorLabel: 'Me',
          },
        ]}
        canStudy
        onClose={jest.fn()}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
      />,
    );

    screen.getByText('Photosynthesis');
    screen.getByText('Photosynthesis turns light into sugar.');
    screen.getByText('Chlorophyll absorbs light.');
    screen.getByText('subjectHub.sheet.study');
    screen.getByText('subjectHub.sheet.review');

    const textNodes = screen.UNSAFE_getAllByType(Text);
    const renderedText = textNodes.map((node) => node.props.children);
    expect(
      renderedText.indexOf('Photosynthesis turns light into sugar.'),
    ).toBeLessThan(renderedText.indexOf('subjectHub.sheet.masteryLine'));
  });

  it('closes and renders nothing when the topic is null', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <TopicDetailSheet
        topic={hubTopic('Description')}
        notes={[]}
        canStudy
        onClose={onClose}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('subject-hub-topic-sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <TopicDetailSheet
        topic={null}
        notes={[]}
        canStudy
        onClose={onClose}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('subject-hub-topic-sheet')).toBeNull();
  });

  it('omits empty descriptions and study actions when canStudy is false', () => {
    render(
      <TopicDetailSheet
        topic={hubTopic(null)}
        notes={[]}
        canStudy={false}
        onClose={jest.fn()}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('subject-hub-topic-description')).toBeNull();
    expect(screen.queryByText('subjectHub.sheet.study')).toBeNull();
    expect(screen.queryByText('subjectHub.sheet.review')).toBeNull();
  });
});
