import type { CurriculumTopic } from '@eduagent/schemas';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type {
  HubChapter,
  HubTopicState,
} from './_view-models/subject-hub-state';
import { SubjectHubChapterSection } from './SubjectHubChapterSection';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function topic(id: string, title: string, state: HubTopicState) {
  return {
    topic: {
      id,
      title,
      description: `${title} description`,
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 20,
      bookId: 'book-1',
      chapter: 'Foundations',
      skipped: false,
    } as CurriculumTopic,
    state,
    sessionCount: 1,
  };
}

const chapter: HubChapter = {
  chapter: 'Foundations',
  topics: [
    topic('topic-done', 'Done topic', 'done'),
    topic('topic-mastered', 'Mastered topic', 'mastered'),
  ],
};

describe('SubjectHubChapterSection', () => {
  it('hides rows while collapsed and shows them after expansion', () => {
    render(
      <SubjectHubChapterSection
        chapter={chapter}
        defaultExpanded={false}
        onOpenTopic={jest.fn()}
      />,
    );

    expect(screen.queryByText('Done topic')).toBeNull();

    fireEvent.press(
      screen.getByTestId('subject-hub-chapter-toggle-Foundations'),
    );
    screen.getByText('Done topic');
    screen.getByText('Mastered topic');
  });

  it('renders chapter mastered progress and a mastered indicator distinct from done', () => {
    render(
      <SubjectHubChapterSection
        chapter={chapter}
        defaultExpanded
        onOpenTopic={jest.fn()}
      />,
    );

    screen.getByText('subjectHub.chapter.progress');
    expect(
      screen.getByTestId('subject-hub-topic-state-done-topic').props.children,
    ).toBe('D');
    expect(
      screen.getByTestId('subject-hub-topic-state-mastered-topic').props
        .children,
    ).toBe('M');
  });

  it('opens the topic sheet callback without navigation', () => {
    const onOpenTopic = jest.fn();

    render(
      <SubjectHubChapterSection
        chapter={chapter}
        defaultExpanded
        onOpenTopic={onOpenTopic}
      />,
    );

    fireEvent.press(screen.getByTestId('subject-hub-topic-topic-mastered'));

    expect(onOpenTopic).toHaveBeenCalledWith('topic-mastered');
  });
});
