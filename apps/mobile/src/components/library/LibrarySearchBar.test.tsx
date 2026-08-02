import { fireEvent, render, screen, act } from '@testing-library/react-native';

import type { SpeechRecognitionStatus } from '../../hooks/use-speech-recognition';
import { ThemeContext } from '../../lib/theme';
import { LibrarySearchBar } from './LibrarySearchBar';

interface MockSpeech {
  status: SpeechRecognitionStatus;
  transcript: string;
  isFinalTranscript: boolean;
  error: string | null;
  isListening: boolean;
  startListening: jest.Mock;
  stopListening: jest.Mock;
  clearTranscript: jest.Mock;
  requestMicrophonePermission: jest.Mock;
  getMicrophonePermissionStatus: jest.Mock;
}

let mockSpeech: MockSpeech;

jest.mock(
  '../../hooks/use-speech-recognition' /* gc1-allow: native-boundary — the hook wraps expo-speech-recognition, a native module with no jest-runnable implementation */,
  () => ({
    useSpeechRecognition: () => mockSpeech,
  }),
);

beforeEach(() => {
  mockSpeech = {
    status: 'idle',
    transcript: '',
    isFinalTranscript: false,
    error: null,
    isListening: false,
    startListening: jest.fn().mockResolvedValue(undefined),
    stopListening: jest.fn().mockResolvedValue(undefined),
    clearTranscript: jest.fn(),
    requestMicrophonePermission: jest.fn().mockResolvedValue(true),
    getMicrophonePermissionStatus: jest.fn().mockResolvedValue(null),
  };
});

// renderWithTheme is only needed when a test asserts theme-derived style props.
function renderWithTheme(ui: Parameters<typeof render>[0]) {
  return render(
    <ThemeContext.Provider
      value={{
        colorScheme: 'light',
        setColorScheme: jest.fn(),
        accentPresetId: null,
        setAccentPresetId: jest.fn(),
      }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

describe('LibrarySearchBar', () => {
  it('renders with placeholder', () => {
    renderWithTheme(
      <LibrarySearchBar
        value=""
        onChangeText={jest.fn()}
        placeholder="Search shelves..."
      />,
    );
    screen.getByTestId('library-search-input');
    expect(screen.getByPlaceholderText('Search shelves...'));
  });

  it('renders the shared voice control and a final transcript REPLACES the query (WI-2552)', async () => {
    const onChangeText = jest.fn();
    const screenApi = render(
      <LibrarySearchBar
        value="mol"
        onChangeText={onChangeText}
        placeholder="Search..."
      />,
    );
    fireEvent.press(screen.getByTestId('library-search-mic'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);

    mockSpeech = {
      ...mockSpeech,
      status: 'idle',
      isListening: false,
      transcript: 'photosynthesis',
      isFinalTranscript: true,
    };
    screenApi.rerender(
      <LibrarySearchBar
        value="mol"
        onChangeText={onChangeText}
        placeholder="Search..."
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(onChangeText).toHaveBeenCalledWith('photosynthesis');
  });

  it('calls onChangeText when typing', () => {
    const onChangeText = jest.fn();
    renderWithTheme(
      <LibrarySearchBar
        value=""
        onChangeText={onChangeText}
        placeholder="Search..."
      />,
    );
    fireEvent.changeText(screen.getByTestId('library-search-input'), 'math');
    expect(onChangeText).toHaveBeenCalledWith('math');
  });

  it('shows clear button when value is non-empty and clears on press', () => {
    const onChangeText = jest.fn();
    renderWithTheme(
      <LibrarySearchBar
        value="math"
        onChangeText={onChangeText}
        placeholder="Search..."
      />,
    );
    screen.getByTestId('library-search-clear');
    fireEvent.press(screen.getByTestId('library-search-clear'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('hides clear button when value is empty', () => {
    renderWithTheme(
      <LibrarySearchBar
        value=""
        onChangeText={jest.fn()}
        placeholder="Search..."
      />,
    );
    expect(screen.queryByTestId('library-search-clear')).toBeNull();
  });

  // [a11y sweep] Break tests: the clear-search icon must be a11y-hidden —
  // the Pressable accessibilityLabel "Clear search" already conveys the action.
  it('marks the clear icon wrapper as accessibility-hidden [a11y sweep]', () => {
    const { getByTestId } = renderWithTheme(
      <LibrarySearchBar
        value="math"
        onChangeText={jest.fn()}
        placeholder="Search..."
      />,
    );
    const iconWrapper = getByTestId('library-search-clear-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
  });

  it('clear icon is excluded from default visible-only queries [a11y sweep]', () => {
    const { queryByTestId } = renderWithTheme(
      <LibrarySearchBar
        value="math"
        onChangeText={jest.fn()}
        placeholder="Search..."
      />,
    );
    expect(queryByTestId('library-search-clear-icon')).toBeNull();
  });
});
