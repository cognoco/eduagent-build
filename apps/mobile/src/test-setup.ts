// Initialize i18next synchronously with the real English catalog so every
// test renders the same English strings the app would. Tests that need
// different behavior (e.g., assertion on raw key) can still jest.mock
// react-i18next per-file. Without this, components using useTranslation()
// receive the raw key as text because the i18n module's async IIFE init in
// apps/mobile/src/i18n/index.ts hasn't resolved by the time the test renders.
import i18nextInstance from 'i18next';
import { initReactI18next as i18nInitPlugin } from 'react-i18next';
import enCatalogForTests from './i18n/locales/en.json';

if (!i18nextInstance.isInitialized) {
  void i18nextInstance.use(i18nInitPlugin).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: enCatalogForTests } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

// @sentry/react-native loads native module config at import time, which fails
// in Jest with "Config file contains no configuration data". Mock globally.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  getCurrentScope: jest.fn(() => ({ clear: jest.fn() })),
  getClient: jest.fn(() => null),
  withScope: jest.fn((cb: (scope: unknown) => void) =>
    cb({ setExtra: jest.fn() }),
  ),
  Severity: { Error: 'error', Warning: 'warning', Info: 'info' },
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const mockIcon = React.forwardRef(() => null);
  mockIcon.displayName = 'MockIcon';
  return {
    __esModule: true,
    Ionicons: mockIcon,
    MaterialIcons: mockIcon,
    FontAwesome: mockIcon,
    FontAwesome5: mockIcon,
    MaterialCommunityIcons: mockIcon,
    Feather: mockIcon,
    AntDesign: mockIcon,
    Entypo: mockIcon,
    EvilIcons: mockIcon,
    Foundation: mockIcon,
    Octicons: mockIcon,
    SimpleLineIcons: mockIcon,
    Zocial: mockIcon,
  };
});

jest.mock('expo/src/winter/ImportMetaRegistry', () => ({
  ImportMetaRegistry: {
    get url() {
      return null;
    },
  },
}));

// expo/src/winter/runtime.native.ts installs `__ExpoImportMetaRegistry` as a
// lazy global getter that, when accessed, calls `require('./ImportMetaRegistry')`
// — under jest 30 that deferred require trips the "outside test scope" guard
// because it fires after module-eval completes. Stubbing the runtime module
// short-circuits the lazy install entirely. The two paths cover both
// jest-expo platform resolutions (./runtime and ./runtime.native).
jest.mock('expo/src/winter/runtime.native', () => ({}), { virtual: true });
jest.mock('expo/src/winter/runtime', () => ({}), { virtual: true });

jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  const chainable = { delay: () => chainable, duration: () => chainable };
  return {
    __esModule: true,
    default: {
      View,
      Text,
      ScrollView: View,
      createAnimatedComponent: (c: unknown) => c,
    },
    FadeIn: chainable,
    FadeInUp: chainable,
    FadeOutDown: chainable,
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useSharedValue: (v: unknown) => ({ value: v }),
    useReducedMotion: () => false,
    useFrameCallback: () => undefined,
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    cancelAnimation: () => undefined,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: {
      linear: undefined,
      ease: undefined,
      bezier: () => undefined,
      inOut: () => undefined,
      out: () => undefined,
      in: () => undefined,
      elastic: () => undefined,
      bounce: undefined,
      quad: undefined,
      cubic: undefined,
      exp: undefined,
      circle: undefined,
      sin: undefined,
      poly: () => undefined,
      back: () => undefined,
      step0: undefined,
      step1: undefined,
    },
  };
});

jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: View,
    Svg: View,
    Rect: View,
    Circle: View,
    Ellipse: View,
    Path: View,
    Line: View,
    G: View,
    Defs: View,
    LinearGradient: View,
    RadialGradient: View,
    Stop: View,
    Polygon: View,
  };
});

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    logIn: jest.fn().mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
      created: false,
    }),
    logOut: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
    getOfferings: jest.fn().mockResolvedValue({ current: null, all: {} }),
    getCustomerInfo: jest.fn().mockResolvedValue({
      entitlements: { active: {}, all: {} },
      activeSubscriptions: [],
    }),
    purchasePackage: jest.fn().mockResolvedValue({
      productIdentifier: '',
      customerInfo: { entitlements: { active: {} } },
    }),
    restorePurchases: jest.fn().mockResolvedValue({
      entitlements: { active: {}, all: {} },
    }),
  },
  LOG_LEVEL: {
    VERBOSE: 'VERBOSE',
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
  },
}));

jest.mock('@clerk/clerk-expo', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ClerkProvider: ({ children }: any) => children,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ClerkLoaded: ({ children }: any) => children,
  useAuth: jest.fn().mockReturnValue({
    isLoaded: true,
    isSignedIn: false,
    signOut: jest.fn(),
    getToken: jest.fn().mockResolvedValue('mock-token'),
  }),
  useUser: jest.fn().mockReturnValue({
    isLoaded: true,
    user: {
      firstName: 'Alex',
      lastName: 'Test',
      primaryEmailAddress: { emailAddress: 'alex@example.com' },
      fullName: 'Alex Test',
    },
  }),
  useSignIn: jest.fn().mockReturnValue({
    isLoaded: true,
    signIn: {
      create: jest.fn(),
      attemptFirstFactor: jest.fn(),
    },
    setActive: jest.fn(),
  }),
  useSignUp: jest.fn().mockReturnValue({
    isLoaded: true,
    signUp: {
      create: jest.fn(),
      prepareEmailAddressVerification: jest.fn(),
      attemptEmailAddressVerification: jest.fn(),
    },
    setActive: jest.fn(),
  }),
  useSSO: jest.fn().mockReturnValue({
    startSSOFlow: jest.fn(),
  }),
}));

jest.mock('@clerk/clerk-expo/token-cache', () => ({
  tokenCache: {
    getToken: jest.fn(),
    saveToken: jest.fn(),
    clearToken: jest.fn(),
  },
}));

jest.mock('expo-web-browser', () => ({
  warmUpAsync: jest.fn().mockResolvedValue(undefined),
  coolDownAsync: jest.fn().mockResolvedValue(undefined),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('mentomate://sso-callback'),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

// expo-haptics throws "method not available on ios" when invoked under jest
// because there's no native binding. Stub the impact / notification / select
// surfaces and the enum constants the project consumes via lib/haptics.ts.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: 'granted', expires: 'never', granted: true }),
  requestPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: 'granted', expires: 'never', granted: true }),
  getExpoPushTokenAsync: jest
    .fn()
    .mockResolvedValue({ data: 'ExponentPushToken[mock-token]', type: 'expo' }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// expo-crypto loads a native module on import; mock to Node's randomUUID so
// the outbox dedup-id path works under jest. The runtime app uses
// expo-crypto's Hermes-safe implementation; this mock just keeps test parity.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('crypto');
  return {
    randomUUID: () => nodeCrypto.randomUUID(),
    getRandomBytesAsync: async (size: number) =>
      new Uint8Array(nodeCrypto.randomBytes(size)),
    digestStringAsync: async (_alg: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data).digest('hex'),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  };
});

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      multiRemove: jest.fn(async (keys: ReadonlyArray<string>) => {
        for (const key of keys) store.delete(key);
      }),
      getAllKeys: jest.fn(async () => Array.from(store.keys())),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (object) => JSON.parse(JSON.stringify(object));
}

// Force TanStack Query to notify synchronously in tests.
// The default scheduler uses setTimeout(cb, 0) which causes React state updates
// to fire after act() boundaries, triggering "not wrapped in act()" warnings.

const { notifyManager } = require('@tanstack/react-query');
notifyManager.setScheduler((cb: () => void) => {
  cb();
});

// Note: TextInput native component stubs (AndroidTextInputNativeComponent,
// RCTSingelineTextInputNativeComponent, RCTMultilineTextInputNativeComponent)
// are handled via moduleNameMapper in jest.config.cjs → jest.text-input-native-mock.js.
// They cannot live here as jest.mock() factories because the react-native-css-interop
// Babel plugin rewrites React.createElement → _ReactNativeCSSInterop.createInteropElement
// at file scope, making that variable an out-of-scope reference inside hoisted factories.
