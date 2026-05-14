import React from 'react';
import { render } from '@testing-library/react-native';
import ChildDetailLayout from './_layout';

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

jest.mock('../../../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({ background: '#000' }),
}));

describe('child/[profileId]/_layout.tsx', () => {
  beforeEach(() => {
    capturedStackProps = null;
    capturedScreens.length = 0;
  });

  it('sets initialRouteName="index" on the Stack', () => {
    render(<ChildDetailLayout />);
    expect(capturedStackProps?.initialRouteName).toBe('index');
  });

  it.each([
    ['session/[sessionId]', 'sessionId'],
    ['report/[reportId]', 'reportId'],
    ['weekly-report/[weeklyReportId]', 'weeklyReportId'],
    ['subjects/[subjectId]', 'subjectId'],
    ['topic/[topicId]', 'topicId'],
  ])('declares %s with getId returning %s from params', (name, paramKey) => {
    render(<ChildDetailLayout />);
    const screen = capturedScreens.find((s) => s.name === name);
    expect(screen).not.toBeUndefined();
    expect(screen!.getId).toBeInstanceOf(Function);
    expect(screen!.getId!({ params: { [paramKey]: 'abc-1' } })).toBe('abc-1');
    expect(screen!.getId!({ params: { [paramKey]: 'xyz-2' } })).toBe('xyz-2');
  });
});
