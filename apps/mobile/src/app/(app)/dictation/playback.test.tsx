import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      textPrimary: '#1f2937',
      textSecondary: '#6b7280',
    }),
  }),
);

const mockGoBackOrReplace = jest.fn();
jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type; goBackOrReplace requires native navigation context */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

// Playback hook — we control state
let mockPlaybackState = 'idle';
const mockStart = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
const mockRepeat = jest.fn();
const mockSkip = jest.fn();

jest.mock(
  '../../../hooks/use-dictation-playback' /* gc1-allow: wraps expo-speech which is a native module not available in JSDOM */,
  () => ({
    useDictationPlayback: () => ({
      state: mockPlaybackState,
      currentIndex: 0,
      totalSentences: 3,
      start: mockStart,
      pause: mockPause,
      resume: mockResume,
      repeat: mockRepeat,
      skip: mockSkip,
    }),
  }),
);

jest.mock(
  '../../../hooks/use-dictation-preferences' /* gc1-allow: wraps SecureStore for native persistence */,
  () => ({
    useDictationPreferences: () => ({
      pace: 'normal',
      punctuationReadAloud: false,
      cyclePace: jest.fn(),
      togglePunctuation: jest.fn(),
    }),
  }),
);

jest.mock(
  '../../../lib/profile' /* gc1-allow: profile context requires full provider tree */,
  () => ({
    ...jest.requireActual('../../../lib/profile'),
    useProfile: () => ({
      activeProfile: { id: 'profile-1', birthYear: 2005 },
    }),
  }),
);

// DictationData context
const mockSetData = jest.fn();

let mockDictationData: {
  completionKey: string;
  sentences: { text: string }[];
  language: string;
  mode: 'homework' | 'surprise';
} | null = {
  completionKey: '00000000-0000-4000-8000-000000000001',
  sentences: [
    { text: 'The quick brown fox.' },
    { text: 'Jumps over the lazy dog.' },
    { text: 'Hello world.' },
  ],
  language: 'en',
  mode: 'surprise',
};

jest.mock(
  './_layout' /* gc1-allow: layout depends on expo-router Stack and native theme — cannot render in JSDOM */,
  () => ({
    useDictationData: () => ({
      data: mockDictationData,
      setData: mockSetData,
      clear: jest.fn(),
    }),
  }),
);

// BackHandler — stub
jest.mock(
  'react-native/Libraries/Utilities/BackHandler' /* gc1-allow: native-boundary: BackHandler is a platform-specific native module not available in JSDOM */,
  () => ({
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  }),
);

const PlaybackScreen = require('./playback').default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaybackScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlaybackState = 'idle';
    mockDictationData = {
      completionKey: '00000000-0000-4000-8000-000000000001',
      sentences: [
        { text: 'The quick brown fox.' },
        { text: 'Jumps over the lazy dog.' },
        { text: 'Hello world.' },
      ],
      language: 'en',
      mode: 'surprise',
    };
  });

  it('renders the playback screen with valid data', () => {
    const { getByTestId } = render(<PlaybackScreen />);
    getByTestId('dictation-playback-screen');
    getByTestId('playback-pace');
    getByTestId('playback-punctuation');
    getByTestId('playback-skip');
    getByTestId('playback-repeat');
    getByTestId('playback-exit');
  });

  it('shows progress counter', () => {
    const { getByTestId } = render(<PlaybackScreen />);
    const progress = getByTestId('playback-progress');
    expect(progress.props.children).toContain(1);
    expect(progress.props.children).toContain(3);
  });

  it('shows no-data state when data is null', () => {
    mockDictationData = null;
    const { getByTestId } = render(<PlaybackScreen />);
    getByTestId('dictation-playback-screen');
    getByTestId('playback-go-back');
  });

  it('navigates back when go-back pressed in no-data state', () => {
    mockDictationData = null;
    const { getByTestId } = render(<PlaybackScreen />);
    fireEvent.press(getByTestId('playback-go-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/practice',
    );
  });

  it('navigates to complete when playback state becomes complete', () => {
    mockPlaybackState = 'complete';
    render(<PlaybackScreen />);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/dictation/complete');
  });

  it('shows exit confirmation modal when exit button pressed', () => {
    const { getByTestId } = render(<PlaybackScreen />);
    fireEvent.press(getByTestId('playback-exit'));
    getByTestId('dictation-exit-modal-backdrop');
    getByTestId('dictation-exit-confirm');
    getByTestId('dictation-exit-cancel');
  });

  it('navigates to practice when exit confirmed', () => {
    const { getByTestId } = render(<PlaybackScreen />);
    fireEvent.press(getByTestId('playback-exit'));
    fireEvent.press(getByTestId('dictation-exit-confirm'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
  });

  it('pressing cancel does NOT navigate away (stays in session)', () => {
    const { getByTestId } = render(<PlaybackScreen />);
    fireEvent.press(getByTestId('playback-exit'));
    fireEvent.press(getByTestId('dictation-exit-cancel'));
    // Confirm exit navigation must NOT have fired
    expect(mockReplace).not.toHaveBeenCalledWith('/(app)/practice');
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('calls pause when tap area pressed while not paused', () => {
    mockPlaybackState = 'speaking';
    const { getByTestId } = render(<PlaybackScreen />);
    fireEvent.press(getByTestId('playback-tap-area'));
    expect(mockPause).toHaveBeenCalledTimes(1);
  });

  it('calls resume when tap area pressed while paused', () => {
    mockPlaybackState = 'paused';
    const { getByTestId } = render(<PlaybackScreen />);
    fireEvent.press(getByTestId('playback-tap-area'));
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('calls repeat when repeat button pressed', () => {
    const { getByTestId } = render(<PlaybackScreen />);
    fireEvent.press(getByTestId('playback-repeat'));
    expect(mockRepeat).toHaveBeenCalledTimes(1);
  });

  it('calls skip when skip button pressed', () => {
    const { getByTestId } = render(<PlaybackScreen />);
    fireEvent.press(getByTestId('playback-skip'));
    expect(mockSkip).toHaveBeenCalledTimes(1);
  });

  it('auto-starts playback on mount when data is present', () => {
    render(<PlaybackScreen />);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('does not auto-start when sentence list is empty', () => {
    mockDictationData = {
      completionKey: '00000000-0000-4000-8000-000000000001',
      sentences: [],
      language: 'en',
      mode: 'surprise',
    };
    render(<PlaybackScreen />);
    expect(mockStart).not.toHaveBeenCalled();
  });
});
