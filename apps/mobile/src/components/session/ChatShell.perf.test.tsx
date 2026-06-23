// [PERF-879] Regression tests for two ChatShell perf bugs:
//   1. A failed homework image used to flip a SHARED `failedImages` Set in
//      ChatShell, changing the memoised `renderItem` identity and forcing the
//      FlatList to re-render EVERY row. The fix scopes image-failure state to
//      the row component (ChatMessageRow), so a broken image re-renders only
//      its own row.
//   2. animateResponse ran a 40ms setInterval that ticked setMessages/
//      setIsStreaming. Callers that did not cancel it on unmount leaked the
//      interval and triggered state-update-after-unmount. Cleanup is now
//      idempotent + latched, and the caller pattern below cancels on unmount.

import { useEffect, useRef, useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { ChatShell, animateResponse, type ChatMessage } from './ChatShell';

// ---------------------------------------------------------------------------
// Native-boundary mocks (same set ChatShell.test.tsx uses). These are platform
// modules with no real implementation under Jest, not internal app code.
// ---------------------------------------------------------------------------

// prettier-ignore
jest.mock('expo-router', () => ({ // gc1-allow: native-boundary — Expo Router is a platform nav module unavailable in Jest
  useRouter: () => ({
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
}));

// prettier-ignore
jest.mock('@react-navigation/native', () => ({ // gc1-allow: native-boundary — React Navigation hooks require native navigation context unavailable in Jest
  useIsFocused: () => true,
}));

// prettier-ignore
jest.mock('react-native-safe-area-context', () => ({ // gc1-allow: native-boundary — safe area context requires native device metrics unavailable in Jest
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// prettier-ignore
jest.mock('@expo/vector-icons', () => { // gc1-allow: native-boundary — vector icons requires native font assets unavailable in Jest
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...rest }: { name: string }) => (
      <Text {...rest}>{name}</Text>
    ),
  };
});

// prettier-ignore
jest.mock('../../hooks/use-speech-recognition', () => ({ // gc1-allow: voice hook touches native recording APIs outside component scope
  useSpeechRecognition: () => ({
    status: 'idle',
    transcript: '',
    error: null,
    isListening: false,
    startListening: jest.fn().mockResolvedValue(undefined),
    stopListening: jest.fn().mockResolvedValue(undefined),
    clearTranscript: jest.fn(),
    requestMicrophonePermission: jest.fn().mockResolvedValue(true),
    getMicrophonePermissionStatus: jest
      .fn()
      .mockResolvedValue({ granted: true, canAskAgain: true }),
  }),
}));

// prettier-ignore
jest.mock('../../hooks/use-text-to-speech', () => ({ // gc1-allow: voice output hook touches native speech APIs outside component scope
  useTextToSpeech: () => ({
    isSpeaking: false,
    rate: 1.0,
    speak: jest.fn(),
    stop: jest.fn(),
    replay: jest.fn(),
    setRate: jest.fn(),
  }),
}));

// prettier-ignore
jest.mock('../common', () => ({ // gc1-allow: animations leak timers; ThemedMarkdown wraps native markdown renderer with focused coverage elsewhere
  DeskLampAnimation: () => null,
  MagicPenAnimation: () => null,
  ThemedMarkdown: ({ children }: { children: unknown }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, children);
  },
}));

// Count MessageBubble renders by delegating to the REAL component (not an
// internal mock that replaces behaviour) — the render-count is what proves the
// other rows did not re-render when one image fails.
const mockBubbleRenderSpy = jest.fn();
// prettier-ignore
jest.mock('./MessageBubble', () => { // gc1-allow: render-counting passthrough delegates to the real MessageBubble via requireActual
  const actual = jest.requireActual('./MessageBubble');
  const React = require('react');
  return {
    ...actual,
    MessageBubble: (props: Record<string, unknown>) => {
      mockBubbleRenderSpy(props.testID);
      return React.createElement(actual.MessageBubble, props);
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ChatShell — per-row image failure isolation [PERF-879]', () => {
  const twoImageMessages: ChatMessage[] = [
    {
      id: 'img-a',
      role: 'user',
      content: 'first',
      imageUri: 'file:///cache/a.jpg',
    },
    {
      id: 'img-b',
      role: 'user',
      content: 'second',
      imageUri: 'file:///cache/b.jpg',
    },
  ];

  it('a failed image re-renders only its own row, not sibling rows', () => {
    render(
      <ChatShell
        title="Test"
        messages={twoImageMessages}
        onSend={jest.fn()}
        isStreaming={false}
      />,
    );

    // Both images render initially.
    screen.getByTestId('message-image-img-a');
    screen.getByTestId('message-image-img-b');

    // Count renders per bubble after initial mount.
    const rendersFor = (testID: string) =>
      mockBubbleRenderSpy.mock.calls.filter(([id]) => id === testID).length;
    const bBefore = rendersFor('message-bubble-user-1');
    mockBubbleRenderSpy.mockClear();

    // Row A's image fails to load.
    act(() => {
      fireEvent(screen.getByTestId('message-image-img-a'), 'error');
    });

    // Row A now shows its fallback (its own state changed).
    screen.getByTestId('message-image-fallback-img-a');
    // Row B's image is untouched — no fallback for it.
    screen.getByTestId('message-image-img-b');

    // Crucially: row B's MessageBubble did NOT re-render as a side effect of
    // row A's image failure. With the old shared `failedImages` Set + a
    // renderItem callback depending on it, the FlatList re-rendered every row.
    expect(rendersFor('message-bubble-user-1')).toBe(0);
    expect(bBefore).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Unmount-leak: reproduce the real caller pattern (store cleanup in a ref,
// cancel it on unmount) and prove no setter fires after unmount.
// ---------------------------------------------------------------------------

function StreamingCaller({
  response,
  setMessagesSpy,
}: {
  response: string;
  setMessagesSpy: jest.Mock;
}) {
  const [, setMessages] = useState<ChatMessage[]>([]);
  const [, setIsStreaming] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  // Stable refs so the start-stream effect can run exactly once on mount with
  // no stale-closure deps (avoids needing an exhaustive-deps suppression).
  const responseRef = useRef(response);
  const setMessagesSpyRef = useRef(setMessagesSpy);

  // Start the stream once on mount.
  useEffect(() => {
    cleanupRef.current = animateResponse(
      responseRef.current,
      (updater) => {
        setMessagesSpyRef.current();
        setMessages(updater);
      },
      setIsStreaming,
    );
  }, []);

  // The fix: cancel the animateResponse interval on unmount.
  useEffect(() => {
    const ref = cleanupRef;
    return () => ref.current?.();
  }, []);

  return null;
}

describe('animateResponse caller — unmount cancels the interval [PERF-879]', () => {
  it('does not call setMessages after the caller unmounts mid-stream', () => {
    jest.useFakeTimers();
    try {
      const setMessagesSpy = jest.fn();
      const view = render(
        <StreamingCaller
          response="one two three four five six seven eight"
          setMessagesSpy={setMessagesSpy}
        />,
      );

      // Let a couple of stream ticks fire.
      act(() => {
        jest.advanceTimersByTime(40 * 2);
      });
      expect(setMessagesSpy.mock.calls.length).toBeGreaterThan(0);

      // Unmount mid-stream — this runs the cleanup effect.
      act(() => {
        view.unmount();
      });
      const callsAtUnmount = setMessagesSpy.mock.calls.length;

      // Drain every timer the leaked interval would have run.
      act(() => {
        jest.runAllTimers();
      });

      // No setMessages after unmount — interval was cancelled.
      expect(setMessagesSpy.mock.calls.length).toBe(callsAtUnmount);
    } finally {
      jest.useRealTimers();
    }
  });
});
