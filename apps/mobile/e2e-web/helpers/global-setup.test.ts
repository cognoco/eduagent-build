import { clerkSetup } from '@clerk/testing/playwright';
import dotenv from 'dotenv';
import globalSetup, { resolveClerkPublishableKey } from './global-setup';

jest.mock('@clerk/testing/playwright', () => ({ clerkSetup: jest.fn() }));
jest.mock('dotenv', () => ({
  __esModule: true,
  default: { config: jest.fn() },
}));

describe('resolveClerkPublishableKey', () => {
  const originalClerkKey = process.env.CLERK_PUBLISHABLE_KEY;
  const originalExpoKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  afterEach(() => {
    if (originalClerkKey === undefined) {
      delete process.env.CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.CLERK_PUBLISHABLE_KEY = originalClerkKey;
    }
    if (originalExpoKey === undefined) {
      delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = originalExpoKey;
    }
    jest.clearAllMocks();
    jest.mocked(dotenv.config).mockReset();
  });

  it('uses the Expo-prefixed local key when no explicit key is supplied', () => {
    expect(
      resolveClerkPublishableKey({
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_expo',
      }),
    ).toBe('pk_test_expo');
  });

  it('supports an explicit Clerk key', () => {
    expect(
      resolveClerkPublishableKey({ CLERK_PUBLISHABLE_KEY: 'pk_test_explicit' }),
    ).toBe('pk_test_explicit');
  });

  it('accepts matching explicit and Expo-prefixed keys', () => {
    expect(
      resolveClerkPublishableKey({
        CLERK_PUBLISHABLE_KEY: 'pk_test_matching',
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_matching',
      }),
    ).toBe('pk_test_matching');
  });

  it('fails before browser setup when both key names are absent', () => {
    expect(() => resolveClerkPublishableKey({})).toThrow(
      'Clerk publishable key is required for Playwright global setup',
    );
  });

  it('fails without disclosing key material when the two key names conflict', () => {
    expect(() =>
      resolveClerkPublishableKey({
        CLERK_PUBLISHABLE_KEY: 'pk_test_explicit',
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_expo',
      }),
    ).toThrow('must match');
  });

  it('binds the resolved local key before invoking Clerk setup', async () => {
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    jest.mocked(dotenv.config).mockImplementation(() => {
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_expo';
      return { parsed: { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_expo' } };
    });

    await globalSetup();

    expect(process.env.CLERK_PUBLISHABLE_KEY).toBe('pk_test_expo');
    expect(dotenv.config).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringMatching(/apps[/\\]mobile[/\\]\.env\.local$/),
      }),
    );
    expect(clerkSetup).toHaveBeenCalledTimes(1);
  });
});
