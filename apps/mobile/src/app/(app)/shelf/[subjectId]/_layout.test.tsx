import React from 'react';
import { render } from '@testing-library/react-native';
import SubjectShelfLayout, { unstable_settings } from './_layout';

// ---------------------------------------------------------------------------
// Mock expo-router's Stack — capture Stack.Screen props
// ---------------------------------------------------------------------------

interface ScreenProps {
  name: string;
  getId?: (opts: { params?: Record<string, string> }) => string | undefined;
}

const capturedScreens: ScreenProps[] = [];

jest.mock('expo-router', () => {
  function MockStack({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  }
  MockStack.Screen = (props: ScreenProps) => {
    capturedScreens.push(props);
    return null;
  };
  return { Stack: MockStack };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shelf/[subjectId]/_layout.tsx', () => {
  beforeEach(() => {
    capturedScreens.length = 0;
  });

  it('declares a Stack.Screen for book/[bookId] with getId', () => {
    render(<SubjectShelfLayout />);

    const screen = capturedScreens.find((s) => s.name === 'book/[bookId]');
    expect(screen).toBeDefined();
    expect(screen!.getId).toBeInstanceOf(Function);
  });

  it('getId returns bookId from params — prevents screen reuse across books', () => {
    render(<SubjectShelfLayout />);

    const screen = capturedScreens.find((s) => s.name === 'book/[bookId]')!;
    expect(screen.getId!({ params: { bookId: 'algebra-101' } })).toBe(
      'algebra-101'
    );
    expect(screen.getId!({ params: { bookId: 'geometry-202' } })).toBe(
      'geometry-202'
    );
  });

  it('getId returns different values for different books (no caching)', () => {
    render(<SubjectShelfLayout />);

    const screen = capturedScreens.find((s) => s.name === 'book/[bookId]')!;
    const idA = screen.getId!({ params: { bookId: 'book-A' } });
    const idB = screen.getId!({ params: { bookId: 'book-B' } });

    expect(idA).not.toBe(idB);
  });

  // Cross-tab deep pushes (e.g. Library → shelf/[subjectId]/book/[bookId])
  // must land with `index` underneath `book/[bookId]` so router.back() returns
  // to the shelf instead of falling through to the Tabs first-route.
  it('exports unstable_settings.initialRouteName = "index"', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });
});
