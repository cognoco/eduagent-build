import {
  resolveNavigationContract,
  type NavigationContract,
  type ProfileContext,
  type RouteKey,
} from './navigation-contract';

type ContractProfile = NonNullable<ProfileContext['activeProfile']>;
type SubscriptionContext = ProfileContext['subscription'];

const ISO = '2026-05-21T00:00:00.000Z';
const ADULT_BIRTH_YEAR = 1985;
const CHILD_BIRTH_YEAR = 2014;

const studyTabs = ['home', 'library', 'progress', 'more'] as const;
const familyTabs = ['home', 'recaps', 'progress', 'more'] as const;
const proxyTabs = ['home', 'library', 'progress'] as const;
const legacyGuardianTabs = [
  'home',
  'own-learning',
  'library',
  'progress',
  'more',
] as const;

function makeProfile(
  overrides: Partial<ContractProfile> & { id: string },
): ContractProfile {
  return {
    accountId: '00000000-0000-7000-a000-000000000001',
    avatarUrl: null,
    birthYear: ADULT_BIRTH_YEAR,
    consentStatus: null,
    conversationLanguage: 'en',
    createdAt: ISO,
    defaultAppContext: null,
    displayName: 'Profile',
    hasFamilyLinks: false,
    hasPremiumLlm: false,
    isOwner: true,
    linkCreatedAt: null,
    location: null,
    pronouns: null,
    updatedAt: ISO,
    ...overrides,
  } as ContractProfile;
}

const adult = makeProfile({
  id: '00000000-0000-7000-a000-000000000101',
});
const familyAdult = makeProfile({
  id: '00000000-0000-7000-a000-000000000102',
  defaultAppContext: 'family',
  hasFamilyLinks: true,
});
const child = makeProfile({
  id: '00000000-0000-7000-a000-000000000201',
  birthYear: CHILD_BIRTH_YEAR,
  isOwner: false,
  linkCreatedAt: ISO,
});
const underAgeOwnerWithLinks = makeProfile({
  id: '00000000-0000-7000-a000-000000000301',
  birthYear: CHILD_BIRTH_YEAR,
  defaultAppContext: 'family',
  hasFamilyLinks: true,
});
const linkedChildParams = { profileId: child.id };
const unlinkedChildParams = {
  profileId: '00000000-0000-7000-a000-000000000299',
};

function makeContext(
  overrides: Partial<Omit<ProfileContext, 'flags' | 'subscription'>> & {
    flags?: Partial<ProfileContext['flags']>;
    subscription?: Partial<SubscriptionContext>;
  } = {},
): ProfileContext {
  const subscription: SubscriptionContext = {
    status: 'ready',
    tier: 'free',
  };
  const {
    flags,
    subscription: subscriptionOverrides,
    ...baseOverrides
  } = overrides;
  const base: Omit<ProfileContext, 'flags' | 'subscription'> = {
    activeProfile: adult,
    appContext: 'study',
    isParentProxy: false,
    profiles: [adult],
    role: 'owner',
  };

  return {
    ...base,
    ...baseOverrides,
    flags: {
      MODE_NAV_V1_ENABLED: true,
      ...flags,
    },
    subscription: {
      ...subscription,
      ...subscriptionOverrides,
    },
  };
}

function sortedTabs(contract: NavigationContract): string[] {
  return [...contract.visibleTabs].sort();
}

function expectTabs(
  contract: NavigationContract,
  expectedTabs: ReadonlyArray<string>,
): void {
  expect(sortedTabs(contract)).toEqual([...expectedTabs].sort());
}

describe('resolveNavigationContract matrix', () => {
  it.each([
    {
      name: 'adult owner without family links stays in Study even with Family intent',
      context: makeContext({
        activeProfile: adult,
        appContext: 'family',
        profiles: [adult],
      }),
      expected: {
        shape: 'study',
        effectiveAppContext: 'study',
        isFamilyCapable: false,
        tabs: studyTabs,
        homeScreen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
        iconName: 'School',
        showAddChild: true,
        showInlineStudyInvite: false,
        showLearnThisToo: false,
        progressScope: 'self',
        reason: 'family-intent-without-family-links',
      },
    },
    {
      name: 'under-18 owner with family links is Study-only',
      context: makeContext({
        activeProfile: underAgeOwnerWithLinks,
        appContext: 'family',
        profiles: [underAgeOwnerWithLinks, child],
      }),
      expected: {
        shape: 'study',
        effectiveAppContext: 'study',
        isFamilyCapable: false,
        tabs: studyTabs,
        homeScreen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
        iconName: 'School',
        showAddChild: false,
        showInlineStudyInvite: false,
        showLearnThisToo: false,
        progressScope: 'self',
        reason: 'family-intent-without-family-links',
      },
    },
    {
      name: 'family-capable adult in Study sees Study shell',
      context: makeContext({
        activeProfile: familyAdult,
        appContext: 'study',
        profiles: [familyAdult, child],
      }),
      expected: {
        shape: 'study',
        effectiveAppContext: 'study',
        isFamilyCapable: true,
        tabs: studyTabs,
        homeScreen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
        iconName: 'School',
        showAddChild: true,
        showInlineStudyInvite: true,
        showLearnThisToo: false,
        progressScope: 'self',
        reason: 'explicit-study',
      },
    },
    {
      name: 'family-capable adult in Family sees Family shell',
      context: makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        profiles: [familyAdult, child],
      }),
      expected: {
        shape: 'family',
        effectiveAppContext: 'family',
        isFamilyCapable: true,
        tabs: familyTabs,
        homeScreen: 'FamilyHome',
        titleKey: 'tabs.children',
        iconName: 'Users',
        showAddChild: true,
        showInlineStudyInvite: true,
        showLearnThisToo: true,
        progressScope: 'children',
        reason: 'explicit-family',
      },
    },
    {
      name: 'family-capable adult defaults to Family from profile default',
      context: makeContext({
        activeProfile: familyAdult,
        appContext: null,
        profiles: [familyAdult, child],
      }),
      expected: {
        shape: 'family',
        effectiveAppContext: 'family',
        isFamilyCapable: true,
        tabs: familyTabs,
        homeScreen: 'FamilyHome',
        titleKey: 'tabs.children',
        iconName: 'Users',
        showAddChild: true,
        showInlineStudyInvite: true,
        showLearnThisToo: true,
        progressScope: 'children',
        reason: 'profile-default-family',
      },
    },
    {
      name: 'proxy mode wins over Family intent',
      context: makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        isParentProxy: true,
        profiles: [familyAdult, child],
      }),
      expected: {
        shape: 'study',
        effectiveAppContext: 'study',
        isFamilyCapable: true,
        tabs: proxyTabs,
        homeScreen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
        iconName: 'School',
        showAddChild: false,
        showInlineStudyInvite: false,
        showLearnThisToo: false,
        progressScope: 'self',
        reason: 'parent-proxy',
      },
    },
    {
      name: 'shared child profile is Study-only',
      context: makeContext({
        activeProfile: child,
        appContext: 'family',
        profiles: [familyAdult, child],
        role: 'child',
      }),
      expected: {
        shape: 'study',
        effectiveAppContext: 'study',
        isFamilyCapable: false,
        tabs: studyTabs,
        homeScreen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
        iconName: 'School',
        showAddChild: false,
        showInlineStudyInvite: false,
        showLearnThisToo: false,
        progressScope: 'self',
        reason: 'child-study-only',
      },
    },
    {
      name: 'loading profile degrades to Study-safe shell',
      context: makeContext({
        activeProfile: null,
        appContext: 'family',
        isParentProxy: true,
        profiles: [],
        role: null,
        subscription: { status: 'loading', tier: null },
      }),
      expected: {
        shape: 'study',
        effectiveAppContext: 'study',
        isFamilyCapable: false,
        tabs: studyTabs,
        homeScreen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
        iconName: 'School',
        showAddChild: false,
        showInlineStudyInvite: false,
        showLearnThisToo: false,
        progressScope: 'self',
        reason: 'profile-loading',
      },
    },
  ])('$name', ({ context, expected }) => {
    const contract = resolveNavigationContract(context);

    expect(contract.shape).toBe(expected.shape);
    expect(contract.effectiveAppContext).toBe(expected.effectiveAppContext);
    expect(contract.isFamilyCapable).toBe(expected.isFamilyCapable);
    expect(contract.isParentProxy).toBe(context.isParentProxy);
    expectTabs(contract, expected.tabs);
    expect(contract.home).toEqual({
      screen: expected.homeScreen,
      titleKey: expected.titleKey,
      iconName: expected.iconName,
    });
    expect(contract.gates.showAddChild).toBe(expected.showAddChild);
    expect(contract.gates.showInlineStudyInvite).toBe(
      expected.showInlineStudyInvite,
    );
    expect(contract.gates.showLearnThisToo).toBe(expected.showLearnThisToo);
    expect(contract.gates.progressScope).toBe(expected.progressScope);
    expect(contract.diagnostic).toMatchObject({
      activeProfileId: context.activeProfile?.id ?? null,
      effectiveAppContext: expected.effectiveAppContext,
      isFamilyCapable: expected.isFamilyCapable,
      isParentProxy: context.isParentProxy,
      reason: expected.reason,
      role: context.role,
      shape: expected.shape,
    });
  });

  it('never exposes raw profile fields in diagnostics', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        profiles: [familyAdult, child],
      }),
    );

    expect(contract.diagnostic).toEqual({
      activeProfileId: familyAdult.id,
      effectiveAppContext: 'family',
      isFamilyCapable: true,
      isParentProxy: false,
      linkedChildIds: [child.id],
      reason: 'explicit-family',
      role: 'owner',
      shape: 'family',
    });
    expect(JSON.stringify(contract.diagnostic)).not.toContain('displayName');
    expect(JSON.stringify(contract.diagnostic)).not.toContain('birthYear');
  });
});

describe('resolveNavigationContract gates', () => {
  it('sets owner-only More and family child-editor gates for a family adult', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        profiles: [familyAdult, child],
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    expect(contract.gates).toEqual(
      expect.objectContaining({
        sessionIsOwner: true,
        showAccommodationChildEditor: true,
        showAccountSecurity: true,
        showBilling: true,
        showCelebrationsChildEditor: true,
        showExportDelete: true,
        showFamilyChildActivity: true,
        showLearnThisToo: true,
        showMentorMemoryChildConsent: true,
        showProgressProfilePicker: true,
        showRemoveFamilyMember: true,
      }),
    );
    expect(contract.queryScope).toEqual({
      appContext: 'family',
      profileId: familyAdult.id,
    });
  });

  it('hides owner-only and child-editor gates for shared child profiles', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: child,
        appContext: 'study',
        profiles: [familyAdult, child],
        role: 'child',
      }),
    );

    expect(contract.gates).toEqual(
      expect.objectContaining({
        sessionIsOwner: false,
        showAccommodationChildEditor: false,
        showAccountSecurity: false,
        showAddChild: false,
        showBilling: false,
        showCelebrationsChildEditor: false,
        showExportDelete: false,
        showFamilyChildActivity: false,
        showLearnThisToo: false,
        showMentorMemoryChildConsent: false,
        showProgressProfilePicker: false,
        showRemoveFamilyMember: false,
      }),
    );
    expect(contract.queryScope).toEqual({
      appContext: 'study',
      profileId: child.id,
    });
  });

  it('hides subscription-tier-only setup affordances while subscription is loading', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: adult,
        appContext: 'family',
        profiles: [adult],
        subscription: { status: 'loading', tier: null },
      }),
    );

    expect(contract.shape).toBe('study');
    expect(contract.gates.showAddChild).toBe(false);
    expect(contract.gates.showBilling).toBe(true);
  });

  it('does not infer V1 family capability from the local child profile list', () => {
    const localFamilyAdult = makeProfile({
      id: '00000000-0000-7000-a000-000000000103',
      defaultAppContext: 'family',
      hasFamilyLinks: false,
    });

    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: localFamilyAdult,
        appContext: 'family',
        profiles: [localFamilyAdult, child],
      }),
    );

    expect(contract.shape).toBe('study');
    expect(contract.isFamilyCapable).toBe(false);
    expect(contract.gates.showLearnThisToo).toBe(false);
    expect(contract.canEnter('recaps')).toBe(false);
  });

  it('keeps Add to my learning hidden when V1 navigation is disabled', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        flags: { MODE_NAV_V1_ENABLED: false },
        profiles: [familyAdult, child],
      }),
    );

    expect(contract.diagnostic.reason).toBe('v1-disabled');
    expect(contract.gates.showLearnThisToo).toBe(false);
  });
});

describe('resolveNavigationContract route predicates', () => {
  function expectRoutes(
    contract: NavigationContract,
    expectations: ReadonlyArray<{
      route: RouteKey;
      params?: Parameters<NavigationContract['canEnter']>[1];
      canEnter: boolean;
      isSurfaced: boolean;
    }>,
  ): void {
    for (const expectation of expectations) {
      expect(contract.canEnter(expectation.route, expectation.params)).toBe(
        expectation.canEnter,
      );
      expect(contract.isSurfaced(expectation.route, expectation.params)).toBe(
        expectation.isSurfaced,
      );
    }
  }

  it('allows Study learning routes and blocks Family-only child routes', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'study',
        profiles: [familyAdult, child],
      }),
    );

    expectRoutes(contract, [
      { route: 'home', canEnter: true, isSurfaced: true },
      { route: 'library', canEnter: true, isSurfaced: true },
      { route: 'recaps', canEnter: false, isSurfaced: false },
      { route: 'recaps/[recapId]', canEnter: false, isSurfaced: false },
      { route: 'progress/saved', canEnter: true, isSurfaced: true },
      { route: 'progress/vocabulary', canEnter: true, isSurfaced: true },
      { route: 'session', canEnter: true, isSurfaced: true },
      { route: 'homework', canEnter: true, isSurfaced: true },
      { route: 'dictation', canEnter: true, isSurfaced: true },
      { route: 'quiz', canEnter: true, isSurfaced: true },
      { route: 'practice', canEnter: true, isSurfaced: true },
      { route: 'mentor-memory', canEnter: true, isSurfaced: true },
      { route: 'more/account', canEnter: true, isSurfaced: true },
      { route: 'more/privacy', canEnter: true, isSurfaced: true },
      {
        route: 'child/[profileId]',
        params: linkedChildParams,
        canEnter: false,
        isSurfaced: false,
      },
      { route: 'subscription', canEnter: true, isSurfaced: true },
    ]);
  });

  it('surfaces Family routes and keeps learning routes reachable only by bridge', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        profiles: [familyAdult, child],
      }),
    );

    expectRoutes(contract, [
      { route: 'home', canEnter: true, isSurfaced: true },
      { route: 'library', canEnter: false, isSurfaced: false },
      { route: 'recaps', canEnter: true, isSurfaced: true },
      { route: 'recaps/[recapId]', canEnter: true, isSurfaced: true },
      { route: 'progress/saved', canEnter: false, isSurfaced: false },
      { route: 'progress/vocabulary', canEnter: false, isSurfaced: false },
      { route: 'session', canEnter: true, isSurfaced: false },
      { route: 'homework', canEnter: true, isSurfaced: false },
      { route: 'dictation', canEnter: true, isSurfaced: false },
      { route: 'quiz', canEnter: true, isSurfaced: false },
      { route: 'practice', canEnter: true, isSurfaced: false },
      { route: 'mentor-memory', canEnter: true, isSurfaced: false },
      {
        route: 'child/[profileId]',
        params: linkedChildParams,
        canEnter: true,
        isSurfaced: true,
      },
      {
        route: 'child/[profileId]/reports',
        params: linkedChildParams,
        canEnter: true,
        isSurfaced: true,
      },
      {
        route: 'child/[profileId]/reports/weekly',
        params: linkedChildParams,
        canEnter: true,
        isSurfaced: true,
      },
      {
        route: 'child/[profileId]/curriculum',
        params: linkedChildParams,
        canEnter: true,
        isSurfaced: true,
      },
      {
        route: 'child/[profileId]',
        params: unlinkedChildParams,
        canEnter: false,
        isSurfaced: false,
      },
      { route: 'topic/relearn', canEnter: true, isSurfaced: false },
      { route: 'subscription', canEnter: true, isSurfaced: true },
      { route: 'more/account', canEnter: true, isSurfaced: true },
      { route: 'more/privacy', canEnter: true, isSurfaced: true },
    ]);
  });

  it('blocks proxy access to Family, learning, child, and billing routes', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        isParentProxy: true,
        profiles: [familyAdult, child],
      }),
    );

    expect(contract.chrome).toEqual({
      modeSwitcher: 'hidden',
      proxyBanner: 'required',
    });
    expectRoutes(contract, [
      { route: 'home', canEnter: true, isSurfaced: true },
      { route: 'library', canEnter: true, isSurfaced: true },
      { route: 'progress', canEnter: true, isSurfaced: true },
      { route: 'progress/saved', canEnter: false, isSurfaced: false },
      { route: 'progress/vocabulary', canEnter: false, isSurfaced: false },
      { route: 'recaps', canEnter: false, isSurfaced: false },
      { route: 'recaps/[recapId]', canEnter: false, isSurfaced: false },
      { route: 'session', canEnter: false, isSurfaced: false },
      { route: 'homework', canEnter: false, isSurfaced: false },
      { route: 'dictation', canEnter: false, isSurfaced: false },
      { route: 'quiz', canEnter: false, isSurfaced: false },
      { route: 'practice', canEnter: false, isSurfaced: false },
      { route: 'mentor-memory', canEnter: false, isSurfaced: false },
      {
        route: 'child/[profileId]',
        params: linkedChildParams,
        canEnter: false,
        isSurfaced: false,
      },
      {
        route: 'child/[profileId]/curriculum',
        params: linkedChildParams,
        canEnter: false,
        isSurfaced: false,
      },
      {
        route: 'create-profile',
        params: { for: 'child' },
        canEnter: false,
        isSurfaced: false,
      },
      { route: 'subscription', canEnter: false, isSurfaced: false },
      { route: 'more/account', canEnter: false, isSurfaced: false },
      { route: 'more/privacy', canEnter: false, isSurfaced: false },
    ]);
  });
});

describe('resolveNavigationContract curriculum route defaults', () => {
  it('surfaces child curriculum when a family-capable adult defaults to Family', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: null,
        profiles: [familyAdult, child],
      }),
    );

    expect(contract.diagnostic.reason).toBe('profile-default-family');
    expect(
      contract.canEnter('child/[profileId]/curriculum', linkedChildParams),
    ).toBe(true);
    expect(
      contract.isSurfaced('child/[profileId]/curriculum', linkedChildParams),
    ).toBe(true);
  });
});

describe('resolveNavigationContract snapshot surface', () => {
  it('captures the PR 1 contract shape for representative contexts', () => {
    const contexts = {
      child: makeContext({
        activeProfile: child,
        appContext: 'family',
        profiles: [familyAdult, child],
        role: 'child',
      }),
      family: makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        profiles: [familyAdult, child],
      }),
      loading: makeContext({
        activeProfile: null,
        appContext: null,
        profiles: [],
        role: null,
        subscription: { status: 'loading', tier: null },
      }),
      proxy: makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        isParentProxy: true,
        profiles: [familyAdult, child],
      }),
      study: makeContext({
        activeProfile: familyAdult,
        appContext: 'study',
        profiles: [familyAdult, child],
      }),
    };

    expect(
      Object.fromEntries(
        Object.entries(contexts).map(([name, context]) => {
          const contract = resolveNavigationContract(context);

          return [
            name,
            {
              chrome: contract.chrome,
              diagnostic: contract.diagnostic,
              gates: contract.gates,
              home: contract.home,
              queryScope: contract.queryScope,
              routeSurface: {
                child: {
                  canEnter: contract.canEnter(
                    'child/[profileId]',
                    linkedChildParams,
                  ),
                  isSurfaced: contract.isSurfaced(
                    'child/[profileId]',
                    linkedChildParams,
                  ),
                },
                childCurriculum: {
                  canEnter: contract.canEnter(
                    'child/[profileId]/curriculum',
                    linkedChildParams,
                  ),
                  isSurfaced: contract.isSurfaced(
                    'child/[profileId]/curriculum',
                    linkedChildParams,
                  ),
                },
                library: {
                  canEnter: contract.canEnter('library'),
                  isSurfaced: contract.isSurfaced('library'),
                },
                recaps: {
                  canEnter: contract.canEnter('recaps'),
                  isSurfaced: contract.isSurfaced('recaps'),
                },
                session: {
                  canEnter: contract.canEnter('session'),
                  isSurfaced: contract.isSurfaced('session'),
                },
                subscription: {
                  canEnter: contract.canEnter('subscription'),
                  isSurfaced: contract.isSurfaced('subscription'),
                },
              },
              shape: contract.shape,
              tabs: sortedTabs(contract),
            },
          ];
        }),
      ),
    ).toMatchSnapshot();
  });
});

describe('V0 fallback - hard constraint (CLAUDE.md, spec section Hard Constraint)', () => {
  it('returns LEGACY_GUARDIAN_TABS (5 tabs) when both flags are off and profile is family-capable', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: null,
        flags: {
          MODE_NAV_V0_ENABLED: false,
          MODE_NAV_V1_ENABLED: false,
        },
        profiles: [familyAdult, child],
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    expectTabs(contract, legacyGuardianTabs);
    expect(contract.diagnostic.reason).toBe('legacy-v0-flags-off');
    expect(contract.gates.showLearnThisToo).toBe(false);
  });

  it('reports v1-disabled (and does not enter the legacy-5-tab path) when V0 flag is on and V1 is off', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: null,
        flags: {
          MODE_NAV_V0_ENABLED: true,
          MODE_NAV_V1_ENABLED: false,
        },
        profiles: [familyAdult, child],
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    expect(contract.diagnostic.reason).toBe('v1-disabled');
    expect(contract.gates.showLearnThisToo).toBe(false);
  });
});
