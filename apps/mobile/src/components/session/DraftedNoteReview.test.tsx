import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const { DraftedNoteReview } = require('./DraftedNoteReview');

describe('DraftedNoteReview', () => {
  const defaultProps = {
    initialContent: 'Photosynthesis converts light into energy.',
    onSave: jest.fn().mockResolvedValue(undefined),
    onSkip: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    defaultProps.onSave = jest.fn().mockResolvedValue(undefined);
  });

  it('renders the review card and initial content', () => {
    render(<DraftedNoteReview {...defaultProps} />);
    screen.getByTestId('drafted-note-review');
    screen.getByTestId('drafted-note-preview');
    screen.getByText('Photosynthesis converts light into energy.');
  });

  it('renders a write-your-own composer when the server sends a guard fallback', () => {
    render(
      <DraftedNoteReview
        {...defaultProps}
        initialContent={null}
        fallbackPrompt="Write this one in your own words."
      />,
    );

    screen.getByTestId('drafted-note-review');
    screen.getByTestId('drafted-note-input');
    screen.getByTestId('drafted-note-fallback-prompt');
    screen.getByText('Write this one in your own words.');
    expect(screen.queryByTestId('drafted-note-preview')).toBeNull();
  });

  it('shows the draft title from i18n', () => {
    render(<DraftedNoteReview {...defaultProps} />);
    screen.getByText("Here's what you know now");
  });

  it('clicking Edit reveals the TextInput', () => {
    render(<DraftedNoteReview {...defaultProps} />);
    expect(screen.queryByTestId('drafted-note-input')).toBeNull();
    fireEvent.press(screen.getByTestId('drafted-note-edit'));
    screen.getByTestId('drafted-note-input');
  });

  it('clicking Save calls onSave with the current content', async () => {
    render(<DraftedNoteReview {...defaultProps} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('drafted-note-save'));
    });
    expect(defaultProps.onSave).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      'Photosynthesis converts light into energy.',
    );
  });

  it('clicking Save after editing calls onSave with the edited content', async () => {
    render(<DraftedNoteReview {...defaultProps} />);
    fireEvent.press(screen.getByTestId('drafted-note-edit'));
    fireEvent.changeText(
      screen.getByTestId('drafted-note-input'),
      'Edited content here.',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('drafted-note-save'));
    });
    expect(defaultProps.onSave).toHaveBeenCalledWith('Edited content here.');
  });

  it('clicking Skip calls onSkip', () => {
    render(<DraftedNoteReview {...defaultProps} />);
    fireEvent.press(screen.getByTestId('drafted-note-skip'));
    expect(defaultProps.onSkip).toHaveBeenCalledTimes(1);
  });
});
