import React from 'react';
import { render } from '@testing-library/react-native';
import ShelfLayout from './_layout';

// ---------------------------------------------------------------------------
// Mock expo-router's Stack — capture the props passed to Stack.Screen so we
// can verify getId is configured correctly.
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

describe('shelf/_layout.tsx', () => {
  beforeEach(() => {
    capturedScreens.length = 0;
  });

  it('declares a Stack.Screen for [subjectId] with getId', () => {
    render(<ShelfLayout />);

    const screen = capturedScreens.find((s) => s.name === '[subjectId]');
    expect(screen).toBeDefined();
    expect(screen!.getId).toBeInstanceOf(Function);
  });

  it('getId returns subjectId from params — prevents screen reuse across subjects', () => {
    render(<ShelfLayout />);

    const screen = capturedScreens.find((s) => s.name === '[subjectId]')!;
    expect(screen.getId!({ params: { subjectId: 'history-123' } })).toBe(
      'history-123'
    );
    expect(screen.getId!({ params: { subjectId: 'geography-456' } })).toBe(
      'geography-456'
    );
  });

  it('getId returns different values for different subjects (no caching)', () => {
    render(<ShelfLayout />);

    const screen = capturedScreens.find((s) => s.name === '[subjectId]')!;
    const idA = screen.getId!({ params: { subjectId: 'sub-A' } });
    const idB = screen.getId!({ params: { subjectId: 'sub-B' } });

    expect(idA).not.toBe(idB);
  });
});
