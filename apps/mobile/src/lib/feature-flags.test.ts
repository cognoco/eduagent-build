describe('FEATURE_FLAGS.ONBOARDING_FAST_PATH', () => {
  const originalFlag = process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.resetModules();

    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH;
    } else {
      process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH = originalFlag;
    }

    process.env.NODE_ENV = originalNodeEnv;
  });

  const loadFeatureFlags = (): typeof import('./feature-flags') => {
    jest.resetModules();
    return require('./feature-flags') as typeof import('./feature-flags');
  };

  it('defaults to true in production builds when env var is unset', () => {
    delete process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH;
    process.env.NODE_ENV = 'production';

    const { FEATURE_FLAGS } = loadFeatureFlags();

    expect(FEATURE_FLAGS.ONBOARDING_FAST_PATH).toBe(true);
  });

  it('is false when env var is explicitly "false", even in production', () => {
    process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH = 'false';
    process.env.NODE_ENV = 'production';

    const { FEATURE_FLAGS } = loadFeatureFlags();

    expect(FEATURE_FLAGS.ONBOARDING_FAST_PATH).toBe(false);
  });

  it('is true when env var is explicitly "true"', () => {
    process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH = 'true';

    const { FEATURE_FLAGS } = loadFeatureFlags();

    expect(FEATURE_FLAGS.ONBOARDING_FAST_PATH).toBe(true);
  });
});
