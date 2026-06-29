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

// ---------------------------------------------------------------------------
// WI-1118 — writable topic-scoped notes (felt-knowing loop Flow 1).
// Authoring lives where a focused topic exists (this sheet), bound to that topic;
// the subject-level section stays read-only. No migration, no loose/topicless note.
// ---------------------------------------------------------------------------

describe('TopicDetailSheet — writable notes (WI-1118)', () => {
  it('renders the add input and submits a trimmed note bound to the focused topic', () => {
    const onAddNote = jest.fn();
    render(
      <TopicDetailSheet
        topic={hubTopic('Photosynthesis turns light into sugar.')}
        notes={[]}
        canStudy
        onClose={jest.fn()}
        onAddNote={onAddNote}
      />,
    );

    const input = screen.getByTestId('subject-hub-notes-input');
    // No voice handler is wired in the hub → the mic must be gated out, not shown
    // as a dead button.
    expect(screen.queryByTestId('notes-mic')).toBeNull();
    // The empty-state copy is the topic-context string, not the subject-level one
    // ("…about this topic", not "…about this subject") — the sheet shows a focused
    // topic, so the generic subject copy would be misleading here.
    screen.getByText('subjectHub.notes.emptyTopic');
    expect(screen.queryByText('subjectHub.notes.empty')).toBeNull();

    fireEvent.changeText(input, '  remember mitosis  ');
    fireEvent(input, 'submitEditing');

    // The draft is trimmed and bound to THIS topic's id.
    expect(onAddNote).toHaveBeenCalledWith('topic-1', 'remember mitosis');
  });

  it('stays read-only (no add input) when no onAddNote handler is wired', () => {
    render(
      <TopicDetailSheet
        topic={hubTopic('Description')}
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
      />,
    );

    // Existing notes still render for reading…
    screen.getByText('Chlorophyll absorbs light.');
    // …but with no handler there is no add input (would silently drop the draft).
    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();
  });

  it('hides the add input for a masked supporter (canStudy=false) even if onAddNote is wired', () => {
    render(
      <TopicDetailSheet
        topic={hubTopic('Description')}
        notes={[
          {
            id: 'note-1',
            topicId: 'topic-1',
            content: 'Chlorophyll absorbs light.',
            origin: 'self',
            authorLabel: 'Me',
          },
        ]}
        canStudy={false}
        onClose={jest.fn()}
        onAddNote={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();
    screen.getByText('Chlorophyll absorbs light.');
  });
});
