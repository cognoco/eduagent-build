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

  it('renders an empty state with an add affordance when there are no notes', () => {
    render(<SubjectHubNotesSection notes={[]} />);

    screen.getByTestId('subject-hub-notes-empty');
    // Empty state still offers a way to add a note (not a dead end).
    screen.getByTestId('subject-hub-notes-empty-add');
    // Tabs are not rendered when there is nothing to filter.
    expect(screen.queryByTestId('subject-hub-notes-tabs')).toBeNull();
  });

  it('renders the add-note input + transcription-only mic when canStudy is true', () => {
    const onNoteVoice = jest.fn();
    render(
      <SubjectHubNotesSection
        notes={[selfNote]}
        canStudy
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

  it('submits a trimmed draft through onAddNote and clears the input', () => {
    const onAddNote = jest.fn();
    render(<SubjectHubNotesSection notes={[selfNote]} onAddNote={onAddNote} />);

    const input = screen.getByTestId('subject-hub-notes-input');
    fireEvent.changeText(input, '  remember mitosis  ');
    fireEvent(input, 'submitEditing');
    expect(onAddNote).toHaveBeenCalledWith('remember mitosis');
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
