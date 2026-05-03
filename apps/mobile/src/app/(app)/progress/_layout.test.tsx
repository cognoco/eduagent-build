import React from 'react';
import { render } from '@testing-library/react-native';
import ProgressLayout from './_layout';

interface StackProps {
  initialRouteName?: string;
  children?: React.ReactNode;
}

interface ScreenProps {
  name: string;
  getId?: (opts: { params?: Record<string, string> }) => string | undefined;
}

let capturedStackProps: StackProps | null = null;
const capturedScreens: ScreenProps[] = [];

jest.mock('expo-router', () => {
  const MockStack = (props: StackProps) => {
    capturedStackProps = props;
    return props.children;
  };
  MockStack.Screen = (props: ScreenProps) => {
    capturedScreens.push(props);
    return null;
  };
  return { Stack: MockStack };
});

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({ background: '#000' }),
}));

describe('progress/_layout.tsx', () => {
  beforeEach(() => {
    capturedStackProps = null;
    capturedScreens.length = 0;
  });

  // Regression guard: tapping the Progress tab was landing on [subjectId]
  // with no params ("No subject selected" dead-end) because the Stack's
  // only JSX-declared child was [subjectId], which React Navigation used
  // as the implicit initial route. Locking initialRouteName to "index"
  // prevents that regression.
  it('sets initialRouteName="index" on the Stack', () => {
    render(<ProgressLayout />);
    expect(capturedStackProps?.initialRouteName).toBe('index');
  });

  it('declares a Stack.Screen for [subjectId] with getId', () => {
    render(<ProgressLayout />);
    const screen = capturedScreens.find((s) => s.name === '[subjectId]');
    expect(screen).not.toBeUndefined();
    expect(screen!.getId).toBeInstanceOf(Function);
  });

  it('getId returns subjectId from params — prevents screen reuse across subjects', () => {
    render(<ProgressLayout />);
    const screen = capturedScreens.find((s) => s.name === '[subjectId]')!;
    expect(screen.getId!({ params: { subjectId: 'math-1' } })).toBe('math-1');
    expect(screen.getId!({ params: { subjectId: 'science-2' } })).toBe(
      'science-2'
    );
  });
});
