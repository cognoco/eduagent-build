import fs from 'node:fs';
import path from 'node:path';

import type { CurriculumTopic } from '@eduagent/schemas';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { SubjectHubData } from '../subject-hub';
import {
  LearningActionRow,
  LearningStateCard,
  LearningSurfaceFrame,
  StructuralFactCard,
  SubjectHubSurface,
} from './index';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

function topic(id: string, title: string): CurriculumTopic {
  return {
    id,
    title,
    description: `${title} description`,
    sortOrder: 1,
    relevance: 'core',
    estimatedMinutes: 20,
    bookId: 'book-1',
    chapter: 'Core',
    skipped: false,
  } as CurriculumTopic;
}

const subjectHubData: SubjectHubData = {
  subjectId: 'subject-1',
  subjectName: 'Biology',
  aggregate: {
    mastered: 4,
    learning: 2,
    total: 9,
    reviewsDue: 3,
    weeklyMasteredDelta: 2,
    recentPracticePoints: 80,
  },
  nextUp: {
    kind: 'resume',
    topicId: 'topic-1',
    bookId: 'book-1',
    topicTitle: 'Cell division',
  },
  chapters: [
    {
      chapter: 'Core',
      topics: [
        {
          topic: topic('topic-1', 'Cell division'),
          state: 'continue-now',
          sessionCount: 1,
        },
      ],
    },
  ],
  notes: [
    {
      id: 'note-1',
      topicId: 'topic-1',
      content: 'Cells split in phases.',
      origin: 'self',
      authorLabel: 'Me',
    },
  ],
  showSearchFilter: false,
  canStudy: true,
};

describe('Learning surface primitives', () => {
  it('renders a semantic frame with caller-owned top action and content', () => {
    const onTopAction = jest.fn();

    render(
      <LearningSurfaceFrame
        audience="supporter"
        scopeKind="person"
        title="Learner record"
        subtitle="Shareable updates"
        topAction={{
          label: 'Refresh',
          onPress: onTopAction,
          testID: 'surface-refresh',
        }}
        testID="surface-frame"
      >
        <LearningStateCard
          state="empty"
          title="Nothing yet"
          message="Updates will appear here."
          testID="surface-empty"
        />
      </LearningSurfaceFrame>,
    );

    screen.getByTestId('surface-frame');
    expect(screen.queryByLabelText('supporter:person')).toBeNull();
    screen.getByText('Learner record');
    screen.getByText('Shareable updates');
    screen.getByTestId('surface-empty');
    fireEvent.press(screen.getByTestId('surface-refresh'));
    expect(onTopAction).toHaveBeenCalledTimes(1);
  });

  it('supports one, two, disabled, and loading actions without firing blocked actions', () => {
    const primary = jest.fn();
    const secondary = jest.fn();
    const disabled = jest.fn();
    const loading = jest.fn();

    render(
      <LearningActionRow
        actions={[
          { label: 'Start', onPress: primary, testID: 'action-start' },
          {
            label: 'Details',
            onPress: secondary,
            variant: 'secondary',
            testID: 'action-details',
          },
          {
            label: 'Disabled',
            onPress: disabled,
            disabled: true,
            testID: 'action-disabled',
          },
        ]}
        trailingAction={{
          label: 'Saving',
          onPress: loading,
          loading: true,
          testID: 'action-saving',
        }}
      />,
    );

    fireEvent.press(screen.getByTestId('action-start'));
    fireEvent.press(screen.getByTestId('action-details'));
    fireEvent.press(screen.getByTestId('action-disabled'));
    fireEvent.press(screen.getByTestId('action-saving'));

    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).toHaveBeenCalledTimes(1);
    expect(disabled).not.toHaveBeenCalled();
    expect(loading).not.toHaveBeenCalled();
  });

  it('renders empty, loading, error, two-action, and reduced-motion motif states', () => {
    const retry = jest.fn();
    const back = jest.fn();

    const { rerender } = render(
      <LearningStateCard
        state="empty"
        title="No reports"
        message="A report will appear here."
        motif={({ reducedMotion }) =>
          reducedMotion ? (
            <LearningStateCard.StaticMotif testID="reports-static-motif" />
          ) : (
            <LearningStateCard.StaticMotif testID="reports-motion-motif" />
          )
        }
        reducedMotion
        primaryAction={{ label: 'Try again', onPress: retry, testID: 'retry' }}
        secondaryAction={{ label: 'Back', onPress: back, testID: 'back' }}
        testID="state-card"
      />,
    );

    screen.getByText('No reports');
    screen.getByTestId('reports-static-motif');
    fireEvent.press(screen.getByTestId('retry'));
    fireEvent.press(screen.getByTestId('back'));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);

    rerender(
      <LearningStateCard
        state="loading"
        title="Loading reports"
        message="Checking for updates."
        primaryAction={{ label: 'Retry', onPress: retry, testID: 'load-retry' }}
        testID="state-loading"
      />,
    );
    screen.getByTestId('state-loading');

    rerender(
      <LearningStateCard
        state="error"
        title="Could not load"
        message="Try again."
        primaryAction={{
          label: 'Retry',
          onPress: retry,
          testID: 'error-retry',
        }}
        testID="state-error"
      />,
    );
    screen.getByTestId('state-error');
    fireEvent.press(screen.getByTestId('error-retry'));
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('does not synthesize a loading timeout action when no primary action is provided', () => {
    jest.useFakeTimers();

    try {
      render(
        <LearningStateCard
          state="loading"
          title="Loading reports"
          message="Checking for updates."
          testID="state-loading"
        />,
      );

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      expect(
        screen.queryByRole('button', { name: 'Loading reports' }),
      ).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders filtered structural facts and appeal states without raw artifacts', () => {
    const onAppeal = jest.fn();

    const { rerender } = render(
      <StructuralFactCard
        headline="Emma has one shareable update."
        structuralOnlyLabel="Structural facts only."
        facts={[
          {
            id: 'fact-1',
            title: 'Practiced fractions',
            detail: 'Completed a review set.',
          },
        ]}
        appeal={{
          label: 'Request attention',
          onPress: onAppeal,
          testID: 'fact-appeal',
        }}
        testID="structural-card"
      />,
    );

    screen.getByText('Emma has one shareable update.');
    screen.getByText('Structural facts only.');
    screen.getByText('Practiced fractions');
    expect(screen.queryByText(/raw note/i)).toBeNull();
    fireEvent.press(screen.getByTestId('fact-appeal'));
    expect(onAppeal).toHaveBeenCalledTimes(1);

    rerender(
      <StructuralFactCard
        headline="Emma has one shareable update."
        structuralOnlyLabel="Structural facts only."
        facts={[]}
        appeal={{
          state: 'pending',
          label: 'Loading',
          testID: 'fact-appeal-pending',
        }}
      />,
    );
    screen.getByTestId('fact-appeal-pending');
    screen.getByLabelText('Loading');
  });

  it('makes SubjectHub study capability explicit and blocks readonly callbacks', () => {
    const onStudyTopic = jest.fn();
    const onReviewTopic = jest.fn();
    const onAddNote = jest.fn();

    const { rerender } = render(
      <SubjectHubSurface
        data={subjectHubData}
        mode="learner-study"
        onStudyTopic={onStudyTopic}
        onReviewTopic={onReviewTopic}
        onAddNote={onAddNote}
      />,
    );

    fireEvent.press(screen.getByTestId('subject-hub-next-up-action'));
    expect(onStudyTopic).toHaveBeenCalledWith('topic-1');

    rerender(
      <SubjectHubSurface
        data={subjectHubData}
        mode="supporter-readonly"
        onStudyTopic={onStudyTopic}
        onReviewTopic={onReviewTopic}
        onAddNote={onAddNote}
      />,
    );

    screen.getByText('Biology');
    expect(screen.queryByTestId('subject-hub-next-up-action')).toBeNull();
    fireEvent.press(screen.getByTestId('subject-hub-topic-topic-1'));
    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();
    expect(onReviewTopic).not.toHaveBeenCalled();
    expect(onAddNote).not.toHaveBeenCalled();
  });

  it('keeps shared primitives free of ownership, navigation, and data-fetch coupling', () => {
    const sourceDir = __dirname;
    const files = fs
      .readdirSync(sourceDir)
      .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'));
    const source = files
      .map((file) => fs.readFileSync(path.join(sourceDir, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(
      /Profile\.isOwner|isOwner|useProfile|useNavigationContract|useMyReports|useMyWeeklyReports|useQuery|useInfiniteQuery/,
    );
  });
});
