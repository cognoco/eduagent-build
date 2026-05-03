import React from 'react';
import { render } from '@testing-library/react-native';
import SubjectLayout, { unstable_settings } from './_layout';

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

describe('subject/_layout.tsx', () => {
  beforeEach(() => {
    capturedScreens.length = 0;
  });

  it('declares a Stack.Screen for [subjectId] with getId', () => {
    render(<SubjectLayout />);

    const screen = capturedScreens.find((s) => s.name === '[subjectId]');
    expect(screen).not.toBeUndefined();
    expect(screen!.getId).toBeInstanceOf(Function);
  });

  // [BUG-797] Cross-tab deep pushes must land with `index` underneath the
  // leaf so router.back() returns to the previous tab/screen rather than
  // falling through to the Tabs first-route (Home).
  it('exports unstable_settings.initialRouteName = "index"', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });
});
