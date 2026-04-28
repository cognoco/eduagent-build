import React from 'react';
import { render } from '@testing-library/react-native';
import OnboardingLayout, { unstable_settings } from './_layout';

interface ScreenProps {
  name: string;
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

describe('onboarding/_layout.tsx', () => {
  beforeEach(() => {
    capturedScreens.length = 0;
  });

  it('declares the expected onboarding stack screens', () => {
    render(<OnboardingLayout />);

    const names = capturedScreens.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'language-picker',
        'pronouns',
        'interview',
        'interests-context',
        'analogy-preference',
        'curriculum-review',
        'language-setup',
      ])
    );
  });

  // [BUG-797] Cross-tab deep pushes (e.g. push notification → /onboarding/interview)
  // must land with `index` underneath so router.back() does not fall through to
  // the Tabs first-route (Home).
  it('exports unstable_settings.initialRouteName = "index"', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });
});
