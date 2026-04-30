import { render, screen, fireEvent } from '@testing-library/react-native';
import { SessionInputModeToggle } from './SessionInputModeToggle';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textInverse: '#fff',
    textSecondary: '#888',
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...rest }: { name: string }) => (
      <Text {...rest}>{name}</Text>
    ),
  };
});

beforeEach(() => jest.clearAllMocks());

describe('SessionInputModeToggle', () => {
  it('renders text and voice options', () => {
    render(<SessionInputModeToggle mode="text" onModeChange={jest.fn()} />);

    expect(screen.getByTestId('input-mode-text')).toBeTruthy();
    expect(screen.getByTestId('input-mode-voice')).toBeTruthy();
  });

  it('marks text as selected when mode is text', () => {
    render(<SessionInputModeToggle mode="text" onModeChange={jest.fn()} />);

    const textButton = screen.getByTestId('input-mode-text');
    expect(textButton.props.accessibilityState?.selected).toBe(true);

    const voiceButton = screen.getByTestId('input-mode-voice');
    expect(voiceButton.props.accessibilityState?.selected).toBe(false);
  });

  it('marks voice as selected when mode is voice', () => {
    render(<SessionInputModeToggle mode="voice" onModeChange={jest.fn()} />);

    const textButton = screen.getByTestId('input-mode-text');
    expect(textButton.props.accessibilityState?.selected).toBe(false);

    const voiceButton = screen.getByTestId('input-mode-voice');
    expect(voiceButton.props.accessibilityState?.selected).toBe(true);
  });

  it('calls onModeChange with text when text is pressed', () => {
    const onModeChange = jest.fn();
    render(<SessionInputModeToggle mode="voice" onModeChange={onModeChange} />);

    fireEvent.press(screen.getByTestId('input-mode-text'));
    expect(onModeChange).toHaveBeenCalledWith('text');
  });

  it('calls onModeChange with voice when voice is pressed', () => {
    const onModeChange = jest.fn();
    render(<SessionInputModeToggle mode="text" onModeChange={onModeChange} />);

    fireEvent.press(screen.getByTestId('input-mode-voice'));
    expect(onModeChange).toHaveBeenCalledWith('voice');
  });

  it('has correct accessibility labels', () => {
    render(<SessionInputModeToggle mode="text" onModeChange={jest.fn()} />);

    expect(screen.getByLabelText('Text mode')).toBeTruthy();
    expect(screen.getByLabelText('Voice mode')).toBeTruthy();
  });

  // [a11y sweep] Break tests: decorative mode icons must be hidden so screen
  // readers only announce the Pressable label, not the icon name.
  it('marks the text-mode icon wrapper as accessibility-hidden [a11y sweep]', () => {
    render(<SessionInputModeToggle mode="text" onModeChange={jest.fn()} />);
    const iconWrapper = screen.getByTestId('input-mode-text-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
  });

  it('text-mode icon is excluded from default visible-only queries [a11y sweep]', () => {
    render(<SessionInputModeToggle mode="text" onModeChange={jest.fn()} />);
    expect(screen.queryByTestId('input-mode-text-icon')).toBeNull();
  });

  it('marks the voice-mode icon wrapper as accessibility-hidden [a11y sweep]', () => {
    render(<SessionInputModeToggle mode="voice" onModeChange={jest.fn()} />);
    const iconWrapper = screen.getByTestId('input-mode-voice-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
  });
});
