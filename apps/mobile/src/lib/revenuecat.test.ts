import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { configureRevenueCat, getRevenueCatApiKey } from './revenuecat';

// ---------------------------------------------------------------------------
// Mock react-native-purchases
// ---------------------------------------------------------------------------

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
  },
  LOG_LEVEL: {
    VERBOSE: 'VERBOSE',
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
  },
}));

// ---------------------------------------------------------------------------
// Tests — getRevenueCatApiKey
// ---------------------------------------------------------------------------

describe('getRevenueCatApiKey', () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS });
    delete process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
    delete process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  });

  it('returns iOS key when platform is ios', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = 'appl_ios_key';

    expect(getRevenueCatApiKey()).toBe('appl_ios_key');
  });

  it('returns Android key when platform is android', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = 'goog_android_key';

    expect(getRevenueCatApiKey()).toBe('goog_android_key');
  });

  it('returns empty string when iOS key is not set', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });

    expect(getRevenueCatApiKey()).toBe('');
  });

  it('returns empty string when Android key is not set', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });

    expect(getRevenueCatApiKey()).toBe('');
  });

  it('returns empty string for web platform', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web' });

    expect(getRevenueCatApiKey()).toBe('');
  });

  it('returns empty string for unsupported platform', () => {
    Object.defineProperty(Platform, 'OS', { value: 'windows' as never });

    expect(getRevenueCatApiKey()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Tests — configureRevenueCat
// ---------------------------------------------------------------------------

describe('configureRevenueCat', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS });
    delete process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
    delete process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  });

  it('does not configure when platform is web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web' });

    configureRevenueCat();

    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(Purchases.setLogLevel).not.toHaveBeenCalled();
  });

  it('does not configure when API key is empty (ios, no env)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });

    configureRevenueCat();

    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(Purchases.setLogLevel).not.toHaveBeenCalled();
  });

  it('does not configure when API key is empty (android, no env)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });

    configureRevenueCat();

    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(Purchases.setLogLevel).not.toHaveBeenCalled();
  });

  it('configures with iOS key and sets DEBUG log level in dev', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = 'appl_test_key';

    configureRevenueCat();

    // __DEV__ is true in test environment
    expect(Purchases.setLogLevel).toHaveBeenCalledWith('DEBUG');
    expect(Purchases.configure).toHaveBeenCalledWith({
      apiKey: 'appl_test_key',
    });
  });

  it('configures with Android key', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = 'goog_test_key';

    configureRevenueCat();

    expect(Purchases.setLogLevel).toHaveBeenCalledWith('DEBUG');
    expect(Purchases.configure).toHaveBeenCalledWith({
      apiKey: 'goog_test_key',
    });
  });

  it('calls setLogLevel before configure', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = 'appl_key';

    const callOrder: string[] = [];
    (Purchases.setLogLevel as jest.Mock).mockImplementation(() => {
      callOrder.push('setLogLevel');
    });
    (Purchases.configure as jest.Mock).mockImplementation(() => {
      callOrder.push('configure');
    });

    configureRevenueCat();

    expect(callOrder).toEqual(['setLogLevel', 'configure']);
  });
});
