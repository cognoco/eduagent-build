/// <reference types="jest" />
//
// Native boundary shim catalog for mobile tests.
//
// Boundary labels (2026-05-12-shared-test-utility-framework-plan.md):
//   native-boundary    Expo/RN modules requiring native bindings unavailable in Jest
//   external-boundary  Third-party services (Clerk, RevenueCat, Sentry)
//   transport-boundary Network/IPC transport layer (fetch, Inngest send)
//   observability      Logging/monitoring silent in tests
//   temporary-internal Legacy internal mock awaiting cleanup
//
// Global shims (test-setup.ts — no per-file mock needed):
//   @sentry/react-native           external-boundary
//   @expo/vector-icons              native-boundary
//   react-native-reanimated         native-boundary
//   react-native-svg                native-boundary
//   react-native-purchases          external-boundary
//   @clerk/clerk-expo               external-boundary
//   @clerk/clerk-expo/token-cache   external-boundary
//   expo-web-browser                native-boundary
//   expo-linking                    native-boundary
//   expo-clipboard                  native-boundary
//   expo-haptics                    native-boundary
//   expo-notifications              native-boundary
//   expo-secure-store               native-boundary
//   expo-crypto                     native-boundary
//   @react-native-async-storage     native-boundary
//
// Per-file shims (this catalog — use require() inside jest.mock factory):
//   expo-router                     native-boundary  → expoRouterShim / expoRouterLayoutShim
//   react-native-safe-area-context  native-boundary  → safeAreaShim

// ─── expo-router  (native-boundary) ───────────────────────────────────

export interface RouterMockFns {
  back: jest.Mock;
  push: jest.Mock;
  replace: jest.Mock;
  canGoBack: jest.Mock;
  navigate: jest.Mock;
  dismiss: jest.Mock;
}

export function createRouterMockFns(
  overrides: Partial<RouterMockFns> = {},
): RouterMockFns {
  return {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => false),
    navigate: jest.fn(),
    dismiss: jest.fn(),
    ...overrides,
  };
}

export function expoRouterShim(
  router: Partial<RouterMockFns> = {},
  params: Record<string, string> = {},
) {
  const defaults = createRouterMockFns();
  const merged = { ...defaults, ...router };
  return {
    useRouter: () => merged,
    useLocalSearchParams: () => params,
    useGlobalSearchParams: () => params,
    useSegments: () => [] as string[],
    usePathname: () => '/',
    Link: require('react-native').Text,
    Redirect: ({ href }: { href: string }) => {
      const { Text } = require('react-native');
      return require('react').createElement(
        Text,
        { testID: 'redirect' },
        String(href),
      );
    },
  };
}

export interface LayoutShimResult {
  mock: {
    Stack: (({ children }: { children: unknown }) => unknown) & {
      Screen: (props: Record<string, unknown>) => null;
    };
    Tabs: (({ children }: { children: unknown }) => unknown) & {
      Screen: (props: Record<string, unknown>) => null;
    };
  };
  capturedScreens: Array<Record<string, unknown>>;
}

export function expoRouterLayoutShim(): LayoutShimResult {
  const capturedScreens: Array<Record<string, unknown>> = [];

  function Container({ children }: { children: unknown }) {
    return children;
  }
  Container.Screen = (props: Record<string, unknown>) => {
    capturedScreens.push(props);
    return null;
  };

  return {
    mock: {
      Stack: Container as LayoutShimResult['mock']['Stack'],
      Tabs: Container as LayoutShimResult['mock']['Tabs'],
    },
    capturedScreens,
  };
}

// ─── react-native-safe-area-context  (native-boundary) ────────────────

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const ZERO_INSETS: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

export function safeAreaShim(insets: Insets = ZERO_INSETS) {
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => insets,
    SafeAreaProvider: View,
    SafeAreaView: View,
  };
}
