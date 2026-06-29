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
    expect(screen.getByText('From session · Apr 24'));
    expect(screen.getByText(/Remember to check/));
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

  it('renders a visible kebab affordance that triggers the note menu (#5)', () => {
    const onLongPress = jest.fn();
    render(<InlineNoteCard {...baseProps} onLongPress={onLongPress} />);
    // The visible "..." button works without long-press (web / touch-only).
    const menuButton = screen.getByTestId('note-card-note-1-menu');
    fireEvent.press(menuButton);
    expect(onLongPress).toHaveBeenCalledWith('note-1');
  });

  it('does not toggle card expansion when kebab is pressed', () => {
    const onLongPress = jest.fn();
    const stopPropagation = jest.fn();
    render(
      <InlineNoteCard
        {...baseProps}
        defaultExpanded={false}
        onLongPress={onLongPress}
      />,
    );

    expect(
      screen.getByTestId('note-card-note-1').props.accessibilityLabel,
    ).toContain('Tap to expand');

    fireEvent.press(screen.getByTestId('note-card-note-1-menu'), {
      stopPropagation,
    });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith('note-1');
    expect(
      screen.getByTestId('note-card-note-1').props.accessibilityLabel,
    ).toContain('Tap to expand');
  });

  it('does not render the kebab when no menu handler is provided', () => {
    render(<InlineNoteCard {...baseProps} onLongPress={undefined} />);
    expect(screen.queryByTestId('note-card-note-1-menu')).toBeNull();
  });

  it('calls onSourcePress from the source line', () => {
    const onSourcePress = jest.fn();
    render(<InlineNoteCard {...baseProps} onSourcePress={onSourcePress} />);
    fireEvent.press(screen.getByTestId('note-card-note-1-source'));
    expect(onSourcePress).toHaveBeenCalledTimes(1);
  });

  it('renders without source line for quick notes', () => {
    render(<InlineNoteCard {...baseProps} sourceLine="Note · Apr 24" />);
    expect(screen.getByText('Note · Apr 24'));
  });

  it('shows a verified star for solid concept mastery', () => {
    render(
      <InlineNoteCard
        {...baseProps}
        conceptSignal={{
          verified: true,
          hasMentorAddition: false,
          mentorAdditions: [],
        }}
      />,
    );

    expect(screen.getByTestId('note-card-note-1-verified')).toBeTruthy();
  });

  it('keeps tutor additions collapsed until opened', () => {
    render(
      <InlineNoteCard
        {...baseProps}
        conceptSignal={{
          verified: false,
          hasMentorAddition: true,
          mentorAdditions: ['Use the discriminant before choosing a method.'],
        }}
      />,
    );

    expect(
      screen.queryByText('Use the discriminant before choosing a method.'),
    ).toBeNull();

    fireEvent.press(screen.getByTestId('note-card-note-1-addition-toggle'), {
      stopPropagation: jest.fn(),
    });

    expect(
      screen.getByText('Use the discriminant before choosing a method.'),
    ).toBeTruthy();
  });
});
