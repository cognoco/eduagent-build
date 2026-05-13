import { render, screen, fireEvent } from '@testing-library/react-native';
import { InlineNoteCard } from './InlineNoteCard';

describe('InlineNoteCard', () => {
  const baseProps = {
    noteId: 'note-1',
    topicTitle: 'Quadratic formula',
    content: 'Remember to check the discriminant before applying the formula.',
    sourceLine: 'From session · Apr 24',
    updatedAt: '2026-04-24T10:00:00Z',
    onLongPress: jest.fn(),
  };

  it('renders source line and content preview', () => {
    render(<InlineNoteCard {...baseProps} />);
    expect(screen.getByText('From session · Apr 24')).toBeTruthy();
    expect(screen.getByText(/Remember to check/)).toBeTruthy();
  });

  it('expands on press', () => {
    render(<InlineNoteCard {...baseProps} />);
    fireEvent.press(screen.getByTestId('note-card-note-1'));
  });

  it('calls onLongPress with noteId', () => {
    render(<InlineNoteCard {...baseProps} />);
    fireEvent(screen.getByTestId('note-card-note-1'), 'longPress');
    expect(baseProps.onLongPress).toHaveBeenCalledWith('note-1');
  });

  it('calls onSourcePress from the source line', () => {
    const onSourcePress = jest.fn();
    render(<InlineNoteCard {...baseProps} onSourcePress={onSourcePress} />);
    fireEvent.press(screen.getByTestId('note-card-note-1-source'));
    expect(onSourcePress).toHaveBeenCalledTimes(1);
  });

  it('renders without source line for quick notes', () => {
    render(<InlineNoteCard {...baseProps} sourceLine="Note · Apr 24" />);
    expect(screen.getByText('Note · Apr 24')).toBeTruthy();
  });
});
