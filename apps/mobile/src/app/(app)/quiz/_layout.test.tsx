import React from 'react';
import { render } from '@testing-library/react-native';
import QuizLayout, { unstable_settings } from './_layout';

interface StackProps {
  children?: React.ReactNode;
}

jest.mock('expo-router', () => {
  const MockStack = (props: StackProps) => props.children ?? null;
  return { Stack: MockStack, Redirect: () => null };
});

// gc1-allow: useParentProxy depends on useProfile() context not available in unit tests; mocking the boundary is the simplest way to render the layout in isolation.
jest.mock('../../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => ({
    isParentProxy: false,
    childProfile: null,
    parentProfile: null,
  }),
}));

describe('quiz/_layout.tsx', () => {
  // Cross-tab deep push safety net (CLAUDE.md: ancestor-chain rule).
  it('exports unstable_settings.initialRouteName = "index"', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });

  it('renders without crashing', () => {
    expect(() => render(<QuizLayout />)).not.toThrow();
  });
});
