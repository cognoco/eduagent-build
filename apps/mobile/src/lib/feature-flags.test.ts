describe('FEATURE_FLAGS', () => {
  const originalV2 = process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2;
  const originalManaged = process.env.EXPO_PUBLIC_ENABLE_MANAGED_TIER;

  afterEach(() => {
    jest.resetModules();
    if (originalV2 === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2 = originalV2;
    }
    if (originalManaged === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_MANAGED_TIER;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_MANAGED_TIER = originalManaged;
    }
  });

  it('exposes MODE_NAV_V2_ENABLED and defaults it off', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2;

    jest.isolateModules(() => {
      const { FEATURE_FLAGS } =
        require('./feature-flags') as typeof import('./feature-flags');

      expect(FEATURE_FLAGS).toHaveProperty('MODE_NAV_V2_ENABLED', false);
    });
  });

  it('enables MODE_NAV_V2_ENABLED only for the literal true string', () => {
    process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2 = 'true';

    jest.isolateModules(() => {
      const { FEATURE_FLAGS } =
        require('./feature-flags') as typeof import('./feature-flags');

      expect(FEATURE_FLAGS.MODE_NAV_V2_ENABLED).toBe(true);
    });
  });

  it('exposes MANAGED_TIER_ACTIVE and defaults it off', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_MANAGED_TIER;

    jest.isolateModules(() => {
      const { FEATURE_FLAGS } =
        require('./feature-flags') as typeof import('./feature-flags');

      expect(FEATURE_FLAGS).toHaveProperty('MANAGED_TIER_ACTIVE', false);
    });
  });

  it('enables MANAGED_TIER_ACTIVE only for the literal true string', () => {
    process.env.EXPO_PUBLIC_ENABLE_MANAGED_TIER = 'true';

    jest.isolateModules(() => {
      const { FEATURE_FLAGS } =
        require('./feature-flags') as typeof import('./feature-flags');

      expect(FEATURE_FLAGS.MANAGED_TIER_ACTIVE).toBe(true);
    });
  });
});
