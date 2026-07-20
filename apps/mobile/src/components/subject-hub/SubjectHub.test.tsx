import fs from 'node:fs';
import path from 'node:path';

import type { CurriculumTopic } from '@eduagent/schemas';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SubjectHubData } from './_view-models/subject-hub-state';
import { SubjectHub } from './SubjectHub';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function topic(
  id: string,
  title: string,
  state: SubjectHubData['chapters'][number]['topics'][number]['state'],
) {
  return {
    topic: {
      id,
      title,
      description: `${title} description`,
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 20,
      bookId: 'book-1',
      chapter: 'Core',
      skipped: false,
    } as CurriculumTopic,
    state,
    sessionCount: 1,
  };
}

const baseData: SubjectHubData = {
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
        topic('topic-1', 'Cell division', 'continue-now'),
        topic('topic-2', 'Photosynthesis', 'mastered'),
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
    {
      id: 'note-2',
      topicId: 'topic-2',
      content: 'Mentor saved the light reaction example.',
      origin: 'mentor',
      authorLabel: 'Saved from mentor',
    },
  ],
  showSearchFilter: true,
  canStudy: true,
};

describe('SubjectHub', () => {
  it('renders the hub structure from handed-in data and wires transcription-only search', () => {
    const onSearchVoice = jest.fn();

    render(
      <SubjectHub
        data={baseData}
        onNextUpPress={jest.fn()}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
        onSearchVoice={onSearchVoice}
      />,
    );

    expect(screen.getByTestId('subject-hub-title-subject-1')).toHaveTextContent(
      'Biology',
    );
    screen.getByText('subjectHub.progress.threeState');
    screen.getByText('subjectHub.progress.reviewsDue');
    screen.getByText('subjectHub.progress.weeklyDelta');
    screen.getByText('subjectHub.nextUp.heading');
    screen.getByText('Core');
    screen.getByText('Cells split in phases.');
    expect(
      screen.queryByText('Mentor saved the light reaction example.'),
    ).toBeNull();

    fireEvent.press(screen.getByTestId('subject-hub-notes-mentor'));
    screen.getByText('Mentor saved the light reaction example.');
    expect(screen.queryByText('Cells split in phases.')).toBeNull();

    fireEvent.press(screen.getByTestId('search-mic'));
    expect(onSearchVoice).toHaveBeenCalledWith({
      kind: 'transcription',
      source: 'subject-hub-search',
      analyzesTone: false,
      analyzesEmotion: false,
    });
  });

  it('renders scrambled vocabulary levels in CEFR progression order', () => {
    render(
      <SubjectHub
        data={baseData}
        vocabulary={{
          total: 21,
          mastered: 6,
          learning: 7,
          new: 8,
          byCefrLevel: { C2: 6, A2: 2, B1: 3, A1: 1, C1: 5, B2: 4 },
        }}
      />,
    );

    const renderedLevels = screen
      .getAllByText(/^(A1|A2|B1|B2|C1|C2)$/)
      .map((node) => node.props.children);

    expect(renderedLevels).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  });

  it('keeps masked structural data visible while hiding study and notes affordances', () => {
    render(
      <SubjectHub
        data={{
          ...baseData,
          canStudy: false,
          notes: [],
        }}
        onNextUpPress={jest.fn()}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
      />,
    );

    expect(screen.getByTestId('subject-hub-title-subject-1')).toHaveTextContent(
      'Biology',
    );
    screen.getByText('Core');
    screen.getByText('Photosynthesis');
    expect(screen.queryByText('subjectHub.notes.heading')).toBeNull();
    expect(screen.queryByTestId('subject-hub-next-up-action')).toBeNull();
  });

  it('surfaces the notes section empty state when the learner can study but has no notes', () => {
    render(
      <SubjectHub
        data={{ ...baseData, notes: [] }}
        onNextUpPress={jest.fn()}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
      />,
    );

    // The section renders even with zero notes (canStudy=true), so the empty
    // state is reachable rather than gated out entirely. The add input is NOT
    // shown: SubjectHub wires no onAddNote (subject-hub note persistence is
    // deferred), and an input with no handler would silently drop what's typed.
    screen.getByText('subjectHub.notes.heading');
    screen.getByTestId('subject-hub-notes-empty');
    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();
    // The subject-level mount keeps the default subject-context empty copy (the
    // topic-context override is only passed by TopicDetailSheet).
    screen.getByText('subjectHub.notes.empty');
    expect(screen.queryByText('subjectHub.notes.emptyTopic')).toBeNull();
  });

  it('opens topic details as sheet state rather than route state', () => {
    render(
      <SubjectHub
        data={baseData}
        onNextUpPress={jest.fn()}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('subject-hub-topic-topic-1'));

    screen.getByTestId('subject-hub-topic-sheet');
    screen.getByText('Cell division description');
  });

  it('threads onAddNote to the focused topic sheet and binds the note to that topic (WI-1118)', () => {
    const onAddNote = jest.fn();
    render(
      <SubjectHub
        data={baseData}
        onNextUpPress={jest.fn()}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
        onAddNote={onAddNote}
      />,
    );

    // The subject-level notes section stays read-only — no add input there (no
    // focused topic to bind to). Authoring is reachable only after opening a topic.
    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();

    fireEvent.press(screen.getByTestId('subject-hub-topic-topic-1'));

    const input = screen.getByTestId('subject-hub-notes-input');
    fireEvent.changeText(input, 'mitosis has phases');
    fireEvent(input, 'submitEditing');

    expect(onAddNote).toHaveBeenCalledWith('topic-1', 'mitosis has phases');
  });

  it('keeps the topic sheet notes read-only when no onAddNote is wired', () => {
    render(
      <SubjectHub
        data={baseData}
        onNextUpPress={jest.fn()}
        onStudyTopic={jest.fn()}
        onReviewTopic={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('subject-hub-topic-topic-1'));

    screen.getByTestId('subject-hub-topic-sheet');
    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();
  });

  it('does not read persona, ownership, or navigation contract state', () => {
    const sourcePath = path.join(__dirname, 'SubjectHub.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).not.toMatch(
      /isOwner|useProfile|useNavigationContract|computeAgeBracket/,
    );
  });
});
