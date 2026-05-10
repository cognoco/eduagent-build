import React from 'react';
import { render } from '@testing-library/react-native';
import TopicLayout, { unstable_settings } from './_layout';

// ---------------------------------------------------------------------------
// Mock expo-router's Stack — capture Stack.Screen props
// ---------------------------------------------------------------------------

interface ScreenProps {
  name: string;
  getId?: (opts: { params?: Record<string, string> }) => string | undefined;
}

const capturedScreens: ScreenProps[] = [];

jest.mock('expo-router', () => {
  const MockStack = ({ children }: { children?: React.ReactNode }) => children;
  MockStack.Screen = (props: ScreenProps) => {
    capturedScreens.push(props);
    return null;
  };
  return { Stack: MockStack };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('topic/_layout.tsx', () => {
  beforeEach(() => {
    capturedScreens.length = 0;
  });

  it('declares a Stack.Screen for [topicId] with getId', () => {
    render(<TopicLayout />);

    const screen = capturedScreens.find((s) => s.name === '[topicId]');
    expect(screen).not.toBeUndefined();
    expect(screen!.getId).toBeInstanceOf(Function);
  });

  it('getId returns topicId from params — prevents screen reuse across topics', () => {
    render(<TopicLayout />);

    const screen = capturedScreens.find((s) => s.name === '[topicId]')!;
    expect(screen.getId!({ params: { topicId: 'topic-linear-eq' } })).toBe(
      'topic-linear-eq',
    );
    expect(screen.getId!({ params: { topicId: 'topic-quadratics' } })).toBe(
      'topic-quadratics',
    );
  });

  it('getId returns different values for different topics (no caching)', () => {
    render(<TopicLayout />);

    const screen = capturedScreens.find((s) => s.name === '[topicId]')!;
    const idA = screen.getId!({ params: { topicId: 'topic-A' } });
    const idB = screen.getId!({ params: { topicId: 'topic-B' } });

    expect(idA).not.toBe(idB);
  });

  // [BUG-797] Cross-tab deep pushes (e.g. push notification → /topic/recall-test)
  // must land with `index` underneath the leaf so router.back() returns to topic
  // instead of falling through to the Tabs first-route.
  it('exports unstable_settings.initialRouteName = "index"', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });
});
