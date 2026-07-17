import React from 'react';
import { render } from '@testing-library/react-native';

import MoreLayout from './_layout';

interface StackProps {
  initialRouteName?: string;
  screenOptions?: {
    headerTransparent?: boolean;
  };
  children?: React.ReactNode;
}

interface ScreenProps {
  name: string;
  options?: { headerShown?: boolean; title?: string };
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

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      background: '#000000',
      textPrimary: '#ffffff',
    }),
  }),
);

jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — returns deterministic labels */,
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

describe('MoreLayout native-safe geometry', () => {
  beforeEach(() => {
    capturedStackProps = null;
    capturedScreens.length = 0;
  });

  it('keeps Account under the opaque native header that owns the top safe area', () => {
    render(<MoreLayout />);

    expect(capturedStackProps?.screenOptions?.headerTransparent).toBe(false);
    expect(
      capturedScreens.find((screen) => screen.name === 'account')?.options
        ?.headerShown,
    ).not.toBe(false);
  });
});
