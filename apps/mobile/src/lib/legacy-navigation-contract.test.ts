const {
  computeModeVisibleTabs,
  computeVisibleTabs,
  resolveHomeTabPresentation,
  resolveShellVisibleTabs,
  resolveTabShape,
} = require('./legacy-navigation-contract');

describe('legacy navigation contract', () => {
  it('preserves the V0-off guardian 5-tab shell', () => {
    const tabs = resolveShellVisibleTabs({
      familyCapable: false,
      isParentProxy: false,
      mode: null,
      navigationContract: { visibleTabs: new Set(['home']) },
      tabShape: 'guardian',
      useContract: false,
    });

    expect(tabs).toEqual(
      new Set(['home', 'own-learning', 'library', 'progress', 'more']),
    );
  });

  it('preserves the V0-on Study and Family mode shells', () => {
    expect(computeModeVisibleTabs('study')).toEqual(
      new Set(['home', 'library', 'progress', 'more']),
    );
    expect(computeModeVisibleTabs('family')).toEqual(
      new Set(['home', 'progress', 'more']),
    );

    expect(
      resolveShellVisibleTabs({
        familyCapable: true,
        isParentProxy: false,
        mode: 'family',
        navigationContract: { visibleTabs: new Set(['recaps']) },
        tabShape: 'guardian',
        useContract: false,
      }),
    ).toEqual(new Set(['home', 'progress', 'more']));
  });

  it('preserves proxy shell chrome and hides More', () => {
    expect(computeVisibleTabs('guardian', true)).toEqual(
      new Set(['home', 'library', 'progress']),
    );
    expect(resolveHomeTabPresentation('guardian', true, 'family')).toEqual({
      titleKey: 'tabs.myLearning',
      accessibilityLabelKey: 'tabs.myLearningLabel',
      iconName: 'School',
    });
  });

  it('keeps guardian shape limited to non-proxy owners with linked children', () => {
    expect(
      resolveTabShape({
        activeProfile: { isOwner: true },
        profiles: [{ isOwner: true }, { isOwner: false }],
        isParentProxy: false,
      }),
    ).toBe('guardian');

    expect(
      resolveTabShape({
        activeProfile: { isOwner: true },
        profiles: [{ isOwner: true }, { isOwner: false }],
        isParentProxy: true,
      }),
    ).toBe('learner');
  });
});
