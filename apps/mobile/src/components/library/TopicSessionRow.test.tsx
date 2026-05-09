import { render, screen, fireEvent } from '@testing-library/react-native';
import { TopicSessionRow } from './TopicSessionRow';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#1a1a1a',
    textSecondary: '#525252',
    border: '#e8e0d4',
    surface: '#f8f5ef',
  }),
}));

describe('TopicSessionRow', () => {
  const onPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders testID with sessionId', () => {
    render(
      <TopicSessionRow
        sessionId="abc-123"
        date="May 1"
        durationSeconds={300}
        sessionType="Review"
        onPress={onPress}
      />,
    );
    expect(screen.getByTestId('session-row-abc-123')).toBeTruthy();
  });

  it('renders date', () => {
    render(
      <TopicSessionRow
        sessionId="s1"
        date="Apr 30"
        durationSeconds={120}
        sessionType="Quiz"
        onPress={onPress}
      />,
    );
    screen.getByText('Apr 30');
  });

  it('renders session type', () => {
    render(
      <TopicSessionRow
        sessionId="s1"
        date="Apr 30"
        durationSeconds={120}
        sessionType="Quiz"
        onPress={onPress}
      />,
    );
    screen.getByText('Quiz');
  });

  it('formats duration >= 60 seconds as "X min"', () => {
    render(
      <TopicSessionRow
        sessionId="s1"
        date="Apr 30"
        durationSeconds={300}
        sessionType="Review"
        onPress={onPress}
      />,
    );
    screen.getByText('5 min');
  });

  it('formats duration < 60 seconds as "<1 min"', () => {
    render(
      <TopicSessionRow
        sessionId="s1"
        date="Apr 30"
        durationSeconds={45}
        sessionType="Review"
        onPress={onPress}
      />,
    );
    screen.getByText('<1 min');
  });

  it('formats null duration as "—"', () => {
    render(
      <TopicSessionRow
        sessionId="s1"
        date="Apr 30"
        durationSeconds={null}
        sessionType="Review"
        onPress={onPress}
      />,
    );
    screen.getByText('—');
  });

  it('calls onPress with sessionId when pressed', () => {
    render(
      <TopicSessionRow
        sessionId="abc-123"
        date="May 1"
        durationSeconds={300}
        sessionType="Review"
        onPress={onPress}
      />,
    );
    fireEvent.press(screen.getByTestId('session-row-abc-123'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith('abc-123');
  });

  it('has accessibilityRole button', () => {
    render(
      <TopicSessionRow
        sessionId="s1"
        date="May 1"
        durationSeconds={60}
        sessionType="Review"
        onPress={onPress}
      />,
    );
    const row = screen.getByTestId('session-row-s1');
    expect(row.props.accessibilityRole).toBe('button');
  });

  it('formats 60 seconds as "1 min"', () => {
    render(
      <TopicSessionRow
        sessionId="s2"
        date="May 2"
        durationSeconds={60}
        sessionType="Study"
        onPress={onPress}
      />,
    );
    screen.getByText('1 min');
  });
});
