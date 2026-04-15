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
    cb({ setExtra: jest.fn() })
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
    Path: View,
    Line: View,
    G: View,
    Defs: View,
    LinearGradient: View,
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
