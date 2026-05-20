import React from 'react';
import { render } from '@testing-library/react-native';
import VocabularyLayout, { unstable_settings } from './_layout';
// [CR-2026-05-19-H23] Importing the index ensures `unstable_settings.initialRouteName`
// has an actual route to seed; if `index.tsx` is removed, this test file fails to
// resolve and the safety-net assertion below is no longer vacuous.
import VocabularyIndexRedirect from './index';

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

describe('vocabulary/_layout.tsx', () => {
  beforeEach(() => {
    capturedScreens.length = 0;
  });

  it('declares a Stack.Screen for [subjectId] with getId', () => {
    render(<VocabularyLayout />);

    const screen = capturedScreens.find((s) => s.name === '[subjectId]');
    expect(screen).not.toBeUndefined();
    expect(screen!.getId).toBeInstanceOf(Function);
  });

  // [BUG-797] cross-tab deep push safety net.
  it('exports unstable_settings.initialRouteName = "index"', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });

  // [CR-2026-05-19-H23] The initialRouteName above only works if a real
  // `index.tsx` exists in this directory — verify it resolves and is a
  // renderable component.
  it('has a resolvable index route to satisfy unstable_settings', () => {
    expect(VocabularyIndexRedirect).toBeInstanceOf(Function);
  });
});
