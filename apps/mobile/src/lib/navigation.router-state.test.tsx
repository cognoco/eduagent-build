import React from 'react';
import { Text } from 'react-native';
import { Stack, Tabs, router, useLocalSearchParams } from 'expo-router';
import { act, renderRouter } from 'expo-router/testing-library';
import type { NavigationState, PartialState } from '@react-navigation/native';

import {
  JOURNAL_REPORTS_HREF,
  returnJournalReportToCaller,
} from './navigation';

// Expo Router 6's test helper imports Jest 29's private matcher path, which
// Jest 30 no longer ships despite retaining it in the package export map.
// Supply only the equality matcher the helper needs so this state test can
// exercise the real Expo Router navigator instead of mocking router calls.
// Remove this shim when Expo Router's test helper supports Jest 30 directly.
jest.mock(
  'expect/build/matchers',
  () => {
    const { equals } =
      jest.requireActual<typeof import('@jest/expect-utils')>(
        '@jest/expect-utils',
      );
    return {
      __esModule: true,
      default: {
        customTesters: [],
        toEqual(received: unknown, expected: unknown) {
          const pass = equals(received, expected);
          return {
            pass,
            message: () =>
              `Expected ${JSON.stringify(received)} to equal ${JSON.stringify(expected)}`,
          };
        },
      },
    };
  },
  { virtual: true },
);

jest.mock('expo-linking', () => {
  const actual =
    jest.requireActual<typeof import('expo-linking')>('expo-linking');
  return {
    ...actual,
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  };
});

type RouterState = NavigationState | PartialState<NavigationState>;
type RouterRoute = RouterState['routes'][number];

function RootLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function AppLayout(): React.ReactElement {
  return <Tabs screenOptions={{ headerShown: false }} />;
}

function ProgressLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function ReportsLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function JournalRoute(): React.ReactElement {
  const { section } = useLocalSearchParams<{ section?: string }>();
  return <Text testID="journal-route">{section ?? 'sessions'}</Text>;
}

function RouteLabel({
  testID,
  children,
}: {
  testID: string;
  children: React.ReactNode;
}): React.ReactElement {
  return <Text testID={testID}>{children}</Text>;
}

function findRoute(
  state: RouterState | undefined,
  routeName: string,
): RouterRoute | undefined {
  if (!state) return undefined;
  for (const route of state.routes) {
    if (route.name === routeName) return route;
    const nested = findRoute(route.state as RouterState | undefined, routeName);
    if (nested) return nested;
  }
  return undefined;
}

function activeLeafName(state: RouterState | undefined): string | undefined {
  if (!state) return undefined;
  const route = state.routes[state.index ?? 0];
  return route?.state
    ? activeLeafName(route.state as RouterState)
    : route?.name;
}

describe('returnJournalReportToCaller Expo Router state [WI-2239]', () => {
  it('uses tab-supported navigation and leaves Progress at root after POP_TO cannot cross the tab boundary', () => {
    const view = renderRouter(
      {
        _layout: RootLayout,
        '(app)/_layout': AppLayout,
        '(app)/journal': JournalRoute,
        '(app)/progress/_layout': {
          default: ProgressLayout,
          unstable_settings: { initialRouteName: 'index' },
        },
        '(app)/progress/index': () => (
          <RouteLabel testID="progress-root">Progress</RouteLabel>
        ),
        '(app)/progress/reports/_layout': {
          default: ReportsLayout,
          unstable_settings: { initialRouteName: 'index' },
        },
        '(app)/progress/reports/index': () => (
          <RouteLabel testID="reports-root">Reports</RouteLabel>
        ),
        '(app)/progress/reports/[reportId]': () => (
          <RouteLabel testID="report-detail">Report detail</RouteLabel>
        ),
      },
      {
        initialUrl: '/progress/reports/report-1?returnTo=journal',
      },
    );

    expect(view.getPathname()).toBe('/progress/reports/report-1');
    expect(
      activeLeafName(
        findRoute(view.getRouterState(), 'progress')?.state as
          | RouterState
          | undefined,
      ),
    ).toBe('[reportId]');

    act(() => router.dismissTo(JOURNAL_REPORTS_HREF));

    expect(view.getPathname()).toBe('/progress/reports/report-1');

    act(() => returnJournalReportToCaller(router, 'native'));

    expect(view.getPathname()).toBe('/journal');
    expect(view.getSearchParams()).toMatchObject({ section: 'reports' });
    expect(
      activeLeafName(
        findRoute(view.getRouterState(), 'progress')?.state as
          | RouterState
          | undefined,
      ),
    ).toBe('index');
  });
});
