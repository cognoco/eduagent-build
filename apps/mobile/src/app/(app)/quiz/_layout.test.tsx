import React from 'react';
import { render } from '@testing-library/react-native';
import QuizLayout, { unstable_settings } from './_layout';
import { ProfileContext } from '../../../lib/profile';

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

describe('quiz/_layout.tsx', () => {
  beforeEach(() => {
    capturedStackProps = null;
  });

  it('exports unstable_settings with initialRouteName="index"', () => {
    expect(unstable_settings.initialRouteName).toBe('index');
  });

  it('sets initialRouteName="index" on the Stack', () => {
    render(
      <ProfileContext.Provider
        value={{
          profiles: [],
          activeProfile: null,
          switchProfile: async () => ({ success: true }),
          isLoading: false,
          profileLoadError: null,
          profileWasRemoved: false,
          acknowledgeProfileRemoval: () => undefined,
        }}
      >
        <QuizLayout />
      </ProfileContext.Provider>
    );
    expect(capturedStackProps?.initialRouteName).toBe('index');
  });
});
