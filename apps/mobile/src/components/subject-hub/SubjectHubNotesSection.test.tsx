import { fireEvent, render, screen } from '@testing-library/react-native';

import { SubjectHubNotesSection } from './SubjectHubNotesSection';
import type { SubjectHubNote } from './_view-models/subject-hub-state';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const selfNote: SubjectHubNote = {
  id: 'note-1',
  topicId: 'topic-1',
  content: 'Cells split in phases.',
  origin: 'self',
  authorLabel: 'Me',
};

const mentorNote: SubjectHubNote = {
  id: 'note-2',
  topicId: 'topic-2',
  content: 'Mentor saved the light reaction example.',
  origin: 'mentor',
  authorLabel: 'Saved from mentor',
};

describe('SubjectHubNotesSection', () => {
  it('renders a mixed list and filters per origin view, each row showing its author', () => {
    render(<SubjectHubNotesSection notes={[selfNote, mentorNote]} />);

    // Default "self" view shows the self note + its author label.
    screen.getByText('Cells split in phases.');
    screen.getByText('Me');
    expect(
      screen.queryByText('Mentor saved the light reaction example.'),
    ).toBeNull();

    // Switching to the mentor view shows only mentor-origin rows.
    fireEvent.press(screen.getByTestId('subject-hub-notes-mentor'));
    screen.getByText('Mentor saved the light reaction example.');
    screen.getByText('Saved from mentor');
    expect(screen.queryByText('Cells split in phases.')).toBeNull();
  });

  it('renders an empty state with an add affordance when there are no notes and add is wired', () => {
    render(<SubjectHubNotesSection notes={[]} onAddNote={jest.fn()} />);

    screen.getByTestId('subject-hub-notes-empty');
    // Empty state still offers a way to add a note (not a dead end).
    screen.getByTestId('subject-hub-notes-empty-add');
    // Tabs are not rendered when there is nothing to filter.
    expect(screen.queryByTestId('subject-hub-notes-tabs')).toBeNull();
  });

  it('defaults to the subject-context empty copy, and uses the caller override when given', () => {
    const { rerender } = render(<SubjectHubNotesSection notes={[]} />);
    // No override → the default subject-level key.
    screen.getByText('subjectHub.notes.empty');

    // A caller (the topic-sheet mount) can override the empty copy for its context.
    rerender(
      <SubjectHubNotesSection
        notes={[]}
        emptyMessage="No notes yet. Capture a thought about this topic."
      />,
    );
    screen.getByText('No notes yet. Capture a thought about this topic.');
    expect(screen.queryByText('subjectHub.notes.empty')).toBeNull();
  });

  it('disables the empty-state add action until the draft has text', () => {
    const onAddNote = jest.fn();
    render(<SubjectHubNotesSection notes={[]} onAddNote={onAddNote} />);

    const input = screen.getByTestId('subject-hub-notes-input');
    const emptyAdd = screen.getByTestId('subject-hub-notes-empty-add');

    expect(emptyAdd.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(emptyAdd);
    expect(onAddNote).not.toHaveBeenCalled();

    fireEvent.changeText(input, '   ');
    expect(
      screen.getByTestId('subject-hub-notes-empty-add').props
        .accessibilityState,
    ).toEqual({
      disabled: true,
    });
    fireEvent.press(screen.getByTestId('subject-hub-notes-empty-add'));
    expect(onAddNote).not.toHaveBeenCalled();

    fireEvent.changeText(input, '  remember mitosis  ');
    expect(
      screen.getByTestId('subject-hub-notes-empty-add').props
        .accessibilityState,
    ).toEqual({
      disabled: false,
    });
    fireEvent.press(screen.getByTestId('subject-hub-notes-empty-add'));

    expect(onAddNote).toHaveBeenCalledWith('remember mitosis');
    expect(screen.getByTestId('subject-hub-notes-input').props.value).toBe('');
  });

  it('renders the add-note input + transcription-only mic when canStudy and add is wired', () => {
    const onNoteVoice = jest.fn();
    render(
      <SubjectHubNotesSection
        notes={[selfNote]}
        canStudy
        onAddNote={jest.fn()}
        onNoteVoice={onNoteVoice}
      />,
    );

    screen.getByTestId('subject-hub-notes-input');
    fireEvent.press(screen.getByTestId('notes-mic'));
    expect(onNoteVoice).toHaveBeenCalledWith({
      kind: 'transcription',
      source: 'subject-hub-notes',
      analyzesTone: false,
      analyzesEmotion: false,
    });
  });

  it('renders the add input but NOT the mic when onAddNote is wired without onNoteVoice', () => {
    // The hub wires note authoring without a voice handler (transcription is not
    // wired in the hub). The text input must render, but the mic must be gated out
    // rather than shown as a dead button that does nothing on press.
    render(
      <SubjectHubNotesSection
        notes={[selfNote]}
        canStudy
        onAddNote={jest.fn()}
      />,
    );

    screen.getByTestId('subject-hub-notes-add-row');
    screen.getByTestId('subject-hub-notes-input');
    expect(screen.queryByTestId('notes-mic')).toBeNull();
  });

  it('omits the add input, mic, and empty-add when canStudy but no persistence handler is wired', () => {
    // Subject-hub note persistence is deferred, so SubjectHub renders this section
    // without onAddNote. The add affordance must NOT appear — an input with no
    // handler would clear the draft on submit and silently lose what was typed.
    render(<SubjectHubNotesSection notes={[]} canStudy />);

    screen.getByTestId('subject-hub-notes-empty');
    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();
    expect(screen.queryByTestId('notes-mic')).toBeNull();
    expect(screen.queryByTestId('subject-hub-notes-empty-add')).toBeNull();
  });

  it('submits a trimmed draft through onAddNote and clears the input', () => {
    const onAddNote = jest.fn();
    render(<SubjectHubNotesSection notes={[selfNote]} onAddNote={onAddNote} />);

    const input = screen.getByTestId('subject-hub-notes-input');
    fireEvent.changeText(input, '  remember mitosis  ');
    fireEvent(input, 'submitEditing');
    expect(onAddNote).toHaveBeenCalledWith('remember mitosis');
    expect(screen.getByTestId('subject-hub-notes-input').props.value).toBe('');
  });

  it('omits the add input and mic when canStudy is false (masked supporter view)', () => {
    render(<SubjectHubNotesSection notes={[selfNote]} canStudy={false} />);

    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();
    expect(screen.queryByTestId('notes-mic')).toBeNull();
    // Structural note content still renders for the supporter.
    screen.getByText('Cells split in phases.');
  });

  it('hides the empty-state add affordance when canStudy is false', () => {
    render(<SubjectHubNotesSection notes={[]} canStudy={false} />);

    screen.getByTestId('subject-hub-notes-empty');
    expect(screen.queryByTestId('subject-hub-notes-empty-add')).toBeNull();
    expect(screen.queryByTestId('notes-mic')).toBeNull();
  });
});
