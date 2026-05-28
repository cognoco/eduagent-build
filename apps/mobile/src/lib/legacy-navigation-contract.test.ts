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

  it('holds a stable tab set for a V0 family-capable owner while mode is loading (no 5->3 snap)', () => {
    // Load window: family-capable owner, mode not yet resolved.
    const loadingTabs = resolveShellVisibleTabs({
      familyCapable: true,
      isParentProxy: false,
      mode: null,
      navigationContract: { visibleTabs: new Set(['recaps']) },
      tabShape: 'guardian',
      useContract: false,
    });

    // Must NOT be the transient 5-tab GUARDIAN_TABS shell — that is the bug:
    // it later snaps to the 3-tab Family shell, dropping library/own-learning
    // and losing the active tab.
    expect(loadingTabs).not.toEqual(
      new Set(['home', 'own-learning', 'library', 'progress', 'more']),
    );
    expect(loadingTabs.has('library')).toBe(false);
    expect(loadingTabs.has('own-learning')).toBe(false);

    // Resolved Family mode shell (3 tabs) — the value the load window settles on.
    const resolvedTabs = resolveShellVisibleTabs({
      familyCapable: true,
      isParentProxy: false,
      mode: 'family',
      navigationContract: { visibleTabs: new Set(['recaps']) },
      tabShape: 'guardian',
      useContract: false,
    });

    // The held set during load equals the resolved set: no snap, no lost tab.
    expect(loadingTabs).toEqual(resolvedTabs);
    expect(loadingTabs).toEqual(new Set(['home', 'progress', 'more']));
  });

  it('does not regress the normal V0 guardian 5-tab shell for a non-family-capable owner with mode loading', () => {
    // A normal (non-family-capable) V0 guardian during the load window must
    // still get the full 5-tab GUARDIAN_TABS shell — this is the must-not-
    // regress production default.
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

  it('keeps the V0 learner 4-tab shell unchanged regardless of family capability/mode', () => {
    expect(
      resolveShellVisibleTabs({
        familyCapable: false,
        isParentProxy: false,
        mode: null,
        navigationContract: { visibleTabs: new Set(['home']) },
        tabShape: 'learner',
        useContract: false,
      }),
    ).toEqual(new Set(['home', 'library', 'progress', 'more']));
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
