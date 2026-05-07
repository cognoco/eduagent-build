import React from 'react';
import { render } from '@testing-library/react-native';
import QuizLayout, { unstable_settings } from './_layout';

interface StackProps {
  initialRouteName?: string;
  children?: React.ReactNode;
}

let capturedStackProps: StackProps | null = null;

jest.mock('expo-router', () => {
  const MockStack = (props: StackProps) => {
    capturedStackProps = props;
    return props.children;
  };

  return {
    Redirect: () => null,
    Stack: MockStack,
  };
});

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({ background: '#000' }),
}));

jest.mock('../../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => ({ isParentProxy: false }),
}));

describe('quiz/_layout.tsx', () => {
  beforeEach(() => {
    capturedStackProps = null;
  });

  it('exports unstable_settings with initialRouteName="index"', () => {
    expect(unstable_settings.initialRouteName).toBe('index');
  });

  it('sets initialRouteName="index" on the Stack', () => {
    render(<QuizLayout />);
    expect(capturedStackProps?.initialRouteName).toBe('index');
  });
});
