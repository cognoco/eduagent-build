jest.mock('expo/src/winter/ImportMetaRegistry', () => ({
  ImportMetaRegistry: {
    get url() {
      return null;
    },
  },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, Text: View, ScrollView: View },
    FadeInUp: { delay: () => ({ duration: () => ({}) }) },
    FadeOutDown: { duration: () => ({}) },
    useAnimatedStyle: () => ({}),
    useSharedValue: (v: unknown) => ({ value: v }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
  };
});

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
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('eduagent://sso-callback'),
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
