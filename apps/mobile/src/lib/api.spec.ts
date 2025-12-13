/**
 * Unit tests for the mobile API client configuration.
 *
 * @see Story 6.2: Configure API Client for Mobile
 */

// Store original __DEV__ value
const originalDev = (global as unknown as { __DEV__: boolean }).__DEV__;

describe('Mobile API Client', () => {
  beforeEach(() => {
    // Reset modules to get fresh imports
    jest.resetModules();
    // Reset environment
    delete process.env.EXPO_PUBLIC_API_URL;
    // Set __DEV__ to true for development mode tests
    (global as unknown as { __DEV__: boolean }).__DEV__ = true;
  });

  afterAll(() => {
    // Restore original __DEV__
    (global as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
  });

  describe('getApiUrl', () => {
    it('should return iOS localhost URL in development mode', () => {
      // Setup default mocks
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: { extra: {} } },
      }));
      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'ios',
          select: (opts: Record<string, string>) => opts.ios || opts.default,
        },
      }));

      const { getApiUrl } = require('./api');
      const url = getApiUrl();
      expect(url).toBe('http://localhost:4000/api');
    });

    it('should return environment variable URL when EXPO_PUBLIC_API_URL is set', () => {
      process.env.EXPO_PUBLIC_API_URL = 'https://custom-api.example.com/api';

      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: { extra: {} } },
      }));
      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'ios',
          select: (opts: Record<string, string>) => opts.ios || opts.default,
        },
      }));

      const { getApiUrl } = require('./api');
      const url = getApiUrl();
      expect(url).toBe('https://custom-api.example.com/api');
    });

    it('should return Expo config URL when extra.apiUrl is set', () => {
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: {
          expoConfig: {
            extra: {
              apiUrl: 'https://config-api.example.com/api',
            },
          },
        },
      }));
      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'ios',
          select: (opts: Record<string, string>) => opts.ios || opts.default,
        },
      }));

      const { getApiUrl } = require('./api');
      const url = getApiUrl();
      expect(url).toBe('https://config-api.example.com/api');
    });

    it('should return Android emulator URL when platform is Android', () => {
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: { extra: {} } },
      }));
      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'android',
          select: (opts: Record<string, string>) =>
            opts.android || opts.default,
        },
      }));

      const { getApiUrl } = require('./api');
      const url = getApiUrl();
      expect(url).toBe('http://10.0.2.2:4000/api');
    });

    it('should return production URL when not in dev mode', () => {
      (global as unknown as { __DEV__: boolean }).__DEV__ = false;

      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: { extra: {} } },
      }));
      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'ios',
          select: (opts: Record<string, string>) => opts.ios || opts.default,
        },
      }));

      const { getApiUrl } = require('./api');
      const url = getApiUrl();
      expect(url).toBe('https://api.example.com/api');
    });
  });

  describe('apiClient', () => {
    it('should export a configured API client instance', () => {
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: { extra: {} } },
      }));
      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'ios',
          select: (opts: Record<string, string>) => opts.ios || opts.default,
        },
      }));

      const { apiClient } = require('./api');

      expect(apiClient).toBeDefined();
      // Verify it has the expected openapi-fetch methods
      expect(typeof apiClient.GET).toBe('function');
      expect(typeof apiClient.POST).toBe('function');
      expect(typeof apiClient.PUT).toBe('function');
      expect(typeof apiClient.DELETE).toBe('function');
    });
  });

  describe('type exports', () => {
    it('should export ApiClient type', () => {
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: { extra: {} } },
      }));
      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'ios',
          select: (opts: Record<string, string>) => opts.ios || opts.default,
        },
      }));

      const api = require('./api');
      expect(api).toBeDefined();
    });

    it('should export API_CONFIG for backwards compatibility', () => {
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: { extra: {} } },
      }));
      jest.doMock('react-native', () => ({
        Platform: {
          OS: 'ios',
          select: (opts: Record<string, string>) => opts.ios || opts.default,
        },
      }));

      const { API_CONFIG } = require('./api');

      expect(API_CONFIG).toBeDefined();
      expect(API_CONFIG.baseUrl).toBeDefined();
    });
  });
});
