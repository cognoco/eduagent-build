import React from 'react';
import { render } from '@testing-library/react-native';
import VocabularyLayout, { unstable_settings } from './_layout';

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

describe('vocabulary/_layout.tsx', () => {
  beforeEach(() => {
    capturedScreens.length = 0;
  });

  it('declares a Stack.Screen for [subjectId] with getId', () => {
    render(<VocabularyLayout />);

    const screen = capturedScreens.find((s) => s.name === '[subjectId]');
    expect(screen).toBeDefined();
    expect(screen!.getId).toBeInstanceOf(Function);
  });

  // [BUG-797] cross-tab deep push safety net.
  it('exports unstable_settings.initialRouteName = "index"', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });
});
