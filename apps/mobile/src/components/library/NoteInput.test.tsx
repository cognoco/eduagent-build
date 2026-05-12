import { render, fireEvent } from '@testing-library/react-native';
import { NoteInput } from './NoteInput';

jest.mock('../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    textSecondary: '#999',
    primary: '#00bcd4',
    error: '#f44',
    warning: '#ff9800',
    success: '#4caf50',
  }),
}));

jest.mock('../../hooks/use-speech-recognition', () => ({
  useSpeechRecognition: () => ({
    status: 'idle',
    transcript: '',
    isListening: false,
    startListening: jest.fn(),
    stopListening: jest.fn(),
    clearTranscript: jest.fn(),
  }),
}));

describe('NoteInput', () => {
  it('renders text input and buttons', () => {
    const { getByTestId, getByText } = render(
      <NoteInput onSave={jest.fn()} onCancel={jest.fn()} />,
    );
    getByTestId('note-text-input');
    getByText('Save');
    getByText('Cancel');
  });

  it('calls onSave with text content', () => {
    const onSave = jest.fn();
    const { getByTestId, getByText } = render(
      <NoteInput onSave={onSave} onCancel={jest.fn()} />,
    );
    fireEvent.changeText(
      getByTestId('note-text-input'),
      'My note about pyramids',
    );
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith('My note about pyramids');
  });

  it('calls onCancel when cancel pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <NoteInput onSave={jest.fn()} onCancel={onCancel} />,
    );
    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows initial value when provided', () => {
    const { getByTestId } = render(
      <NoteInput
        onSave={jest.fn()}
        onCancel={jest.fn()}
        initialValue="Existing note"
      />,
    );
    expect(getByTestId('note-text-input').props.value).toBe('Existing note');
  });

  it('shows character count nudge near limit', () => {
    const longText = 'a'.repeat(4600);
    const { getByTestId, getByText } = render(
      <NoteInput onSave={jest.fn()} onCancel={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('note-text-input'), longText);
    getByText(/getting long/i);
  });
});
