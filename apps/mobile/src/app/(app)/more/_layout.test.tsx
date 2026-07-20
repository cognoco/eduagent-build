import React from 'react';
import { render } from '@testing-library/react-native';

import { ThemeContext } from '../../../lib/theme';
import MoreLayout from './_layout';

interface ScreenProps {
  name: string;
  options?: {
    headerShown?: boolean;
  };
}

const capturedScreens: ScreenProps[] = [];

jest.mock('expo-router' /* gc1-allow: native navigation boundary */, () => {
  const MockStack = ({ children }: { children?: React.ReactNode }) => children;
  MockStack.Screen = (props: ScreenProps) => {
    capturedScreens.push(props);
    return null;
  };
  return { Stack: MockStack };
});

describe('more/_layout.tsx', () => {
  beforeEach(() => {
    capturedScreens.length = 0;
  });

  it('suppresses the native header for the screen-owned Mentor language header', () => {
    render(
      <ThemeContext.Provider
        value={{
          colorScheme: 'dark',
          setColorScheme: jest.fn(),
          accentPresetId: null,
          setAccentPresetId: jest.fn(),
        }}
      >
        <MoreLayout />
      </ThemeContext.Provider>,
    );

    const mentorLanguage = capturedScreens.find(
      (screen) => screen.name === 'mentor-language',
    );

    expect(mentorLanguage).toBeDefined();
    expect(mentorLanguage?.options).toEqual({ headerShown: false });
  });
});
