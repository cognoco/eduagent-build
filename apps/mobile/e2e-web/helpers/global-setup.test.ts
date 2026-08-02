import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
  const originalClerkSecret = process.env.CLERK_SECRET_KEY;
  const originalClerkAudience = process.env.CLERK_AUDIENCE;
  const originalSkipLocalApi = process.env.PLAYWRIGHT_SKIP_LOCAL_API;
  const originalPhaseFile = process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE;
  let phaseDir: string | undefined;

  afterEach(async () => {
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
    if (originalClerkSecret === undefined) {
      delete process.env.CLERK_SECRET_KEY;
    } else {
      process.env.CLERK_SECRET_KEY = originalClerkSecret;
    }
    if (originalClerkAudience === undefined) {
      delete process.env.CLERK_AUDIENCE;
    } else {
      process.env.CLERK_AUDIENCE = originalClerkAudience;
    }
    if (originalSkipLocalApi === undefined) {
      delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    } else {
      process.env.PLAYWRIGHT_SKIP_LOCAL_API = originalSkipLocalApi;
    }
    if (originalPhaseFile === undefined) {
      delete process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE;
    } else {
      process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE = originalPhaseFile;
    }
    if (phaseDir) {
      await rm(phaseDir, { recursive: true, force: true });
      phaseDir = undefined;
    }
    jest.clearAllMocks();
    jest.mocked(clerkSetup).mockReset();
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
    process.env.CLERK_SECRET_KEY = 'sk_test_local';
    delete process.env.CLERK_AUDIENCE;
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    jest.mocked(dotenv.config).mockImplementation((options) => {
      if (String(options?.path).endsWith('.dev.vars')) {
        Object.assign(options?.processEnv ?? {}, {
          CLERK_SECRET_KEY: 'sk_test_local',
          CLERK_AUDIENCE: 'development-api',
        });
        return {
          parsed: {
            CLERK_SECRET_KEY: 'sk_test_local',
            CLERK_AUDIENCE: 'development-api',
          },
        };
      }
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

  it('binds the local API Clerk identity when no runner identity is supplied', async () => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_AUDIENCE;
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    jest.mocked(dotenv.config).mockImplementation((options) => {
      if (String(options?.path).endsWith('.dev.vars')) {
        Object.assign(options?.processEnv ?? {}, {
          CLERK_SECRET_KEY: 'sk_test_local_api',
          CLERK_AUDIENCE: 'development-api',
        });
        return {
          parsed: {
            CLERK_SECRET_KEY: 'sk_test_local_api',
            CLERK_AUDIENCE: 'development-api',
          },
        };
      }
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_expo';
      return { parsed: { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_expo' } };
    });

    await globalSetup();

    expect(process.env.CLERK_SECRET_KEY).toBe('sk_test_local_api');
    expect(process.env.CLERK_AUDIENCE).toBe('development-api');
    expect(clerkSetup).toHaveBeenCalledTimes(1);
  });

  it('rejects a conflicting runner identity before Clerk setup without disclosing values', async () => {
    const runnerSecret = 'sk_test_runner';
    const apiSecret = 'sk_test_local_api';
    process.env.CLERK_SECRET_KEY = runnerSecret;
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    jest.mocked(dotenv.config).mockImplementation((options) => {
      if (String(options?.path).endsWith('.dev.vars')) {
        Object.assign(options?.processEnv ?? {}, {
          CLERK_SECRET_KEY: apiSecret,
        });
        return { parsed: { CLERK_SECRET_KEY: apiSecret } };
      }
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_expo';
      return { parsed: { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_expo' } };
    });

    let thrown: unknown;
    try {
      await globalSetup();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toMatch(
      /does not match the local API Clerk identity/i,
    );
    expect(String(thrown)).not.toContain(runnerSecret);
    expect(String(thrown)).not.toContain(apiSecret);
    expect(clerkSetup).not.toHaveBeenCalled();
  });

  it('rejects a missing local API identity before Clerk setup', async () => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    jest.mocked(dotenv.config).mockImplementation((options) => {
      if (String(options?.path).endsWith('.dev.vars')) return { parsed: {} };
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_expo';
      return { parsed: { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_expo' } };
    });

    await expect(globalSetup()).rejects.toThrow(
      /Local API CLERK_SECRET_KEY is unavailable/i,
    );
    expect(clerkSetup).not.toHaveBeenCalled();
  });

  it('rejects an omitted local API audience before Clerk setup', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_local_api';
    delete process.env.CLERK_AUDIENCE;
    delete process.env.PLAYWRIGHT_SKIP_LOCAL_API;
    jest.mocked(dotenv.config).mockImplementation((options) => {
      if (String(options?.path).endsWith('.dev.vars')) {
        Object.assign(options?.processEnv ?? {}, {
          CLERK_SECRET_KEY: 'sk_test_local_api',
        });
        return { parsed: { CLERK_SECRET_KEY: 'sk_test_local_api' } };
      }
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_expo';
      return { parsed: { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_expo' } };
    });

    await expect(globalSetup()).rejects.toThrow(
      /Local API CLERK_AUDIENCE is unavailable/i,
    );
    expect(clerkSetup).not.toHaveBeenCalled();
  });

  it('keeps shared mode on its configured runner identity without reading local API vars', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_external';
    process.env.PLAYWRIGHT_SKIP_LOCAL_API = '1';
    jest.mocked(dotenv.config).mockImplementation((options) => {
      if (String(options?.path).endsWith('.dev.vars')) {
        throw new Error('shared mode read local API vars');
      }
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_expo';
      return { parsed: { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_expo' } };
    });

    await globalSetup();

    expect(process.env.CLERK_SECRET_KEY).toBe('sk_test_external');
    expect(clerkSetup).toHaveBeenCalledTimes(1);
    expect(jest.mocked(dotenv.config)).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringMatching(/\.dev\.vars$/) }),
    );
  });

  it('records the bounded global-setup completion phases', async () => {
    phaseDir = await mkdtemp(path.join(tmpdir(), 'wi2948-global-setup-'));
    const phaseFile = path.join(phaseDir, 'phases.txt');
    process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE = phaseFile;
    process.env.PLAYWRIGHT_SKIP_LOCAL_API = '1';
    delete process.env.CLERK_SECRET_KEY;
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_dummy';

    await globalSetup();

    await expect(readFile(phaseFile, 'utf8')).resolves.toBe(
      'global-setup-started\nglobal-setup-completed\n',
    );
  });

  it('records only a fixed failure phase when Clerk setup rejects', async () => {
    phaseDir = await mkdtemp(path.join(tmpdir(), 'wi2948-global-setup-'));
    const phaseFile = path.join(phaseDir, 'phases.txt');
    process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE = phaseFile;
    process.env.PLAYWRIGHT_SKIP_LOCAL_API = '1';
    delete process.env.CLERK_SECRET_KEY;
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_dummy';
    jest
      .mocked(clerkSetup)
      .mockRejectedValueOnce(new Error('SECRET_SENTINEL_WI2948'));

    await expect(globalSetup()).rejects.toBeDefined();
    await expect(readFile(phaseFile, 'utf8')).resolves.toBe(
      'global-setup-started\nglobal-setup-failed\n',
    );
  });

  it('rethrows the original setup error when the failure phase cannot be recorded', async () => {
    phaseDir = await mkdtemp(path.join(tmpdir(), 'wi2948-global-setup-'));
    const phaseFile = path.join(phaseDir, 'phases.txt');
    process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE = phaseFile;
    process.env.PLAYWRIGHT_SKIP_LOCAL_API = '1';
    delete process.env.CLERK_SECRET_KEY;
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_dummy';
    const setupError = new Error('original setup failure');
    jest.mocked(clerkSetup).mockImplementationOnce(async () => {
      await rm(phaseDir!, { recursive: true, force: true });
      throw setupError;
    });

    await expect(globalSetup()).rejects.toBe(setupError);
  });
});
