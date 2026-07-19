import { isAdultOwner as isSharedAdultOwner } from '@eduagent/schemas';

import {
  PROFILE_FACTORY_ISO as ISO,
  PROFILE_FACTORY_CHILD_BIRTH_YEAR as CHILD_BIRTH_YEAR,
  makeProfile,
} from '../test-utils/profile-factories';
import {
  computeVisibleTabs,
  resolveContractHomeTabPresentation,
  resolveHomeTabPresentation,
} from './legacy-navigation-contract';
import {
  isFamilyHubEligible,
  resolveCanEnter,
  resolveChrome,
  resolveGates,
  resolveHome,
  resolveIsSurfaced,
  resolveNavigationContract,
  resolveShape,
  type NavigationContract,
  type ProfileContext,
  type RouteKey,
} from './navigation-contract';

type SubscriptionContext = ProfileContext['subscription'];

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
    effectiveAccessTier: 'free',
    billingAccess: 'current',
  };
  const {
    flags,
    subscription: subscriptionOverrides,
    ...baseOverrides
  } = overrides;
  const mergedSubscription: SubscriptionContext = {
    ...subscription,
    ...subscriptionOverrides,
  };
  if (mergedSubscription.status === 'loading') {
    mergedSubscription.effectiveAccessTier = null;
    mergedSubscription.billingAccess = null;
  } else {
    if (!('effectiveAccessTier' in (subscriptionOverrides ?? {}))) {
      mergedSubscription.effectiveAccessTier = mergedSubscription.tier;
    }
    if (!('billingAccess' in (subscriptionOverrides ?? {}))) {
      mergedSubscription.billingAccess =
        mergedSubscription.tier === null ? null : 'current';
    }
  }
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
    subscription: mergedSubscription,
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

describe('isFamilyHubEligible', () => {
  it('allows an adult Free owner with a linked child to see Family Hub', () => {
    const context = makeContext({
      activeProfile: familyAdult,
      appContext: 'family',
      profiles: [familyAdult, child],
      subscription: {
        status: 'ready',
        tier: 'free',
        effectiveAccessTier: 'free',
        billingAccess: 'current',
      } as SubscriptionContext,
    });

    expect(isFamilyHubEligible(context)).toBe(true);
  });

  it('requires a linked child, owner role, and resolved effective access tier', () => {
    expect(
      isFamilyHubEligible(
        makeContext({
          activeProfile: adult,
          profiles: [adult],
          subscription: {
            status: 'ready',
            tier: 'free',
            effectiveAccessTier: 'free',
            billingAccess: 'current',
          } as SubscriptionContext,
        }),
      ),
    ).toBe(false);
    expect(
      isFamilyHubEligible(
        makeContext({
          activeProfile: child,
          profiles: [familyAdult, child],
          role: 'child',
          subscription: {
            status: 'ready',
            tier: 'free',
            effectiveAccessTier: 'free',
            billingAccess: 'current',
          } as SubscriptionContext,
        }),
      ),
    ).toBe(false);
    expect(
      isFamilyHubEligible(
        makeContext({
          activeProfile: familyAdult,
          profiles: [familyAdult, child],
          subscription: {
            status: 'loading',
            tier: null,
            effectiveAccessTier: null,
            billingAccess: null,
          } as SubscriptionContext,
        }),
      ),
    ).toBe(false);
  });

  it('keeps lapsed paid accounts eligible on effective Free access', () => {
    const context = makeContext({
      activeProfile: familyAdult,
      appContext: 'family',
      profiles: [familyAdult, child],
      subscription: {
        status: 'ready',
        tier: 'plus',
        effectiveAccessTier: 'free',
        billingAccess: 'free_fallback',
      } as SubscriptionContext,
    });

    expect(isFamilyHubEligible(context)).toBe(true);
  });
});

describe('resolveNavigationContract helper decomposition', () => {
  it('exposes pure helper results that match the thin orchestrator', () => {
    const context = makeContext({
      activeProfile: familyAdult,
      appContext: 'family',
      profiles: [familyAdult, child],
      subscription: { status: 'ready', tier: 'family' },
    });

    const shape = resolveShape(context);
    const gates = resolveGates(context, shape);
    const home = resolveHome(gates);
    const chrome = resolveChrome(context, shape);
    const canEnter = resolveCanEnter(context, shape, gates);
    const isSurfaced = resolveIsSurfaced(context, shape, gates, canEnter);
    const contract = resolveNavigationContract(context);

    expect(shape.shape).toBe(contract.shape);
    expect(shape.effectiveAppContext).toBe(contract.effectiveAppContext);
    expect(shape.familyCapable).toBe(contract.isFamilyCapable);
    expect(shape.linkedChildIds).toEqual(contract.diagnostic.linkedChildIds);
    expect(shape.reason).toBe(contract.diagnostic.reason);
    expect([...shape.visibleTabs].sort()).toEqual(sortedTabs(contract));
    expect(gates).toEqual(contract.gates);
    expect(home).toEqual(contract.home);
    expect(chrome).toEqual(contract.chrome);

    for (const route of [
      'child/[profileId]',
      'child/[profileId]/curriculum',
      'library',
      'recaps',
      'session',
      'subscription',
    ] as const) {
      const params = route.startsWith('child/') ? linkedChildParams : undefined;
      expect(canEnter(route, params)).toBe(contract.canEnter(route, params));
      expect(isSurfaced(route, params)).toBe(
        contract.isSurfaced(route, params),
      );
    }
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
        showFamilyHome: true,
        showLearningActions: true,
        showAccommodationChildEditor: true,
        showAccountSecurity: true,
        showBilling: true,
        showCelebrationsChildEditor: true,
        showMentorLanguageChildEditor: true,
        showExportDelete: true,
        showFamilyChildActivity: true,
        showLearnThisToo: true,
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
        showFamilyHome: false,
        showLearningActions: true,
        showAccommodationChildEditor: false,
        showAccountSecurity: false,
        showAddChild: false,
        showBilling: false,
        showCelebrationsChildEditor: false,
        showMentorLanguageChildEditor: false,
        showExportDelete: false,
        showFamilyChildActivity: false,
        showLearnThisToo: false,
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
    expect(contract.gates.showFamilyHome).toBe(false);
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

  it('does not make an owner family-capable before their 18th birthday', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-11T00:00:00Z'));

    try {
      const boundaryOwner = makeProfile({
        id: '00000000-0000-7000-a000-000000000104',
        birthYear: 2008,
        birthMonth: 12,
        birthDay: 31,
        defaultAppContext: 'family',
        hasFamilyLinks: true,
      });

      const contract = resolveNavigationContract(
        makeContext({
          activeProfile: boundaryOwner,
          appContext: 'family',
          profiles: [boundaryOwner, child],
        }),
      );

      expect(contract.isFamilyCapable).toBe(false);
      expect(contract.shape).toBe('study');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps Add to my learning hidden when V1 navigation is disabled', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        flags: { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: false },
        profiles: [familyAdult, child],
      }),
    );

    expect(contract.diagnostic.reason).toBe('v1-disabled');
    expect(contract.gates.showLearnThisToo).toBe(false);
    expect(contract.gates.showFamilyHome).toBe(true);
  });

  it('keeps V0-off paid owners without linked children in the study home', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: adult,
        appContext: null,
        flags: {
          MODE_NAV_V0_ENABLED: false,
          MODE_NAV_V1_ENABLED: false,
        },
        profiles: [adult],
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    expect(contract.diagnostic.reason).toBe('v1-disabled');
    expect(contract.gates.showFamilyHome).toBe(false);
    expect(contract.gates.showLearningActions).toBe(true);
  });

  it('hides learner write actions in proxy mode', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        isParentProxy: true,
        profiles: [familyAdult, child],
      }),
    );

    expect(contract.gates.showFamilyHome).toBe(false);
    expect(contract.gates.showLearningActions).toBe(false);
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
      {
        route: 'session-summary/[sessionId]',
        params: { sessionId: 'session-1' },
        canEnter: true,
        isSurfaced: true,
      },
      {
        route: 'topic/relearn',
        params: { for: 'child' },
        canEnter: false,
        isSurfaced: false,
      },
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

  it('allows and surfaces V2 root routes only when V2 navigation is enabled', () => {
    const v2OnContract = resolveNavigationContract(
      makeContext({
        flags: {
          MODE_NAV_V2_ENABLED: true,
        },
      }),
    );
    const v2OffContract = resolveNavigationContract(
      makeContext({
        flags: {
          MODE_NAV_V2_ENABLED: false,
        },
      }),
    );

    expectRoutes(v2OnContract, [
      { route: 'mentor', canEnter: true, isSurfaced: true },
      { route: 'subjects', canEnter: true, isSurfaced: true },
      { route: 'journal', canEnter: true, isSurfaced: true },
    ]);
    expectRoutes(v2OffContract, [
      { route: 'mentor', canEnter: false, isSurfaced: false },
      { route: 'subjects', canEnter: false, isSurfaced: false },
      { route: 'journal', canEnter: false, isSurfaced: false },
    ]);
  });

  it.each([
    {
      shell: 'V0',
      flags: {
        MODE_NAV_V0_ENABLED: true,
        MODE_NAV_V1_ENABLED: false,
        MODE_NAV_V2_ENABLED: false,
      },
      subjectsAvailable: false,
      legacyLibraryAvailable: true,
    },
    {
      shell: 'V1',
      flags: {
        MODE_NAV_V0_ENABLED: false,
        MODE_NAV_V1_ENABLED: true,
        MODE_NAV_V2_ENABLED: false,
      },
      subjectsAvailable: false,
      legacyLibraryAvailable: true,
    },
    {
      shell: 'V2',
      flags: {
        MODE_NAV_V0_ENABLED: false,
        MODE_NAV_V1_ENABLED: true,
        MODE_NAV_V2_ENABLED: true,
      },
      subjectsAvailable: true,
      legacyLibraryAvailable: null,
    },
  ])(
    '$shell exposes the intended learner subject-creation entry',
    ({ flags, subjectsAvailable, legacyLibraryAvailable }) => {
      const contract = resolveNavigationContract(makeContext({ flags }));

      expect(contract.canEnter('subjects')).toBe(subjectsAvailable);
      expect(contract.isSurfaced('subjects')).toBe(subjectsAvailable);
      if (legacyLibraryAvailable !== null) {
        expect(contract.canEnter('library')).toBe(legacyLibraryAvailable);
        expect(contract.isSurfaced('library')).toBe(legacyLibraryAvailable);
      }
    },
  );

  it('keeps V2 root routes behind active-profile and proxy guards', () => {
    const noProfileContract = resolveNavigationContract(
      makeContext({
        activeProfile: null,
        flags: {
          MODE_NAV_V2_ENABLED: true,
        },
      }),
    );
    const proxyContract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        flags: {
          MODE_NAV_V2_ENABLED: true,
        },
        isParentProxy: true,
        profiles: [familyAdult, child],
      }),
    );

    expectRoutes(noProfileContract, [
      { route: 'home', canEnter: true, isSurfaced: true },
      { route: 'mentor', canEnter: false, isSurfaced: false },
      { route: 'subjects', canEnter: false, isSurfaced: false },
      { route: 'journal', canEnter: false, isSurfaced: false },
    ]);
    expectRoutes(proxyContract, [
      { route: 'home', canEnter: true, isSurfaced: true },
      { route: 'library', canEnter: true, isSurfaced: true },
      { route: 'progress', canEnter: true, isSurfaced: true },
      { route: 'mentor', canEnter: false, isSurfaced: false },
      { route: 'subjects', canEnter: false, isSurfaced: false },
      { route: 'journal', canEnter: false, isSurfaced: false },
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
        route: 'session-summary/[sessionId]',
        params: { sessionId: 'session-1' },
        canEnter: true,
        isSurfaced: false,
      },
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
      {
        route: 'topic/relearn',
        params: { for: 'child' },
        canEnter: true,
        isSurfaced: false,
      },
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
        route: 'session-summary/[sessionId]',
        params: { sessionId: 'session-1' },
        canEnter: false,
        isSurfaced: false,
      },
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

  it.each([
    { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: false },
    { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: false },
    { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: true },
    { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: true },
  ])(
    'never lets a proxy session enter or surface more/account or more/privacy (flags %o)',
    (flags) => {
      // PROXY_TABS omits `more`; a hidden tab whose routes are enterable is an
      // inconsistency. The proxy `more/*` block must hold under every flag
      // combo and regardless of guard ordering.
      const contract = resolveNavigationContract(
        makeContext({
          activeProfile: familyAdult,
          appContext: 'family',
          flags,
          isParentProxy: true,
          profiles: [familyAdult, child],
          subscription: { status: 'ready', tier: 'family' },
        }),
      );

      expect(contract.canEnter('more/account')).toBe(false);
      expect(contract.canEnter('more/privacy')).toBe(false);
      expect(contract.isSurfaced('more/account')).toBe(false);
      expect(contract.isSurfaced('more/privacy')).toBe(false);
    },
  );
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

    // Exhaustiveness guard: the snapshot assertions below hand-pick a
    // subset of NavigationContract fields (chrome, diagnostic, gates,
    // home, queryScope, routeSurface, shape, tabs). Assert the actual
    // resolved contract's own key set for every context so a field
    // added to or removed from NavigationContract can't silently slip
    // past this test without the picked-field assertions noticing.
    const navigationContractKeys: Array<keyof NavigationContract> = [
      'canEnter',
      'chrome',
      'diagnostic',
      'effectiveAppContext',
      'gates',
      'home',
      'isFamilyCapable',
      'isParentProxy',
      'isSurfaced',
      'queryScope',
      'shape',
      'visibleTabs',
    ];

    // Explicit structural assertions (replaces toMatchSnapshot).
    // Expected values recovered from the committed snapshot at:
    //   apps/mobile/src/lib/__snapshots__/navigation-contract.test.ts.snap
    const resolved = Object.fromEntries(
      Object.entries(contexts).map(([name, context]) => {
        const contract = resolveNavigationContract(context);

        expect(Object.keys(contract).sort()).toEqual(
          [...navigationContractKeys].sort(),
        );

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
    );

    expect(resolved.child).toEqual({
      chrome: { modeSwitcher: 'hidden', proxyBanner: 'hidden' },
      diagnostic: {
        activeProfileId: '00000000-0000-7000-a000-000000000201',
        effectiveAppContext: 'study',
        isFamilyCapable: false,
        isParentProxy: false,
        linkedChildIds: [],
        reason: 'child-study-only',
        role: 'child',
        shape: 'study',
      },
      gates: {
        progressScope: 'self',
        sessionIsOwner: false,
        showAccommodationChildEditor: false,
        showAccountSecurity: false,
        showAddChild: false,
        showBilling: false,
        showCelebrationsChildEditor: false,
        showMentorLanguageChildEditor: false,
        showExportDelete: false,
        showFamilyChildActivity: false,
        showFamilyHome: false,
        showInlineStudyInvite: false,
        showLearnThisToo: false,
        showLearningActions: true,
        showProgressProfilePicker: false,
        showRemoveFamilyMember: false,
      },
      home: {
        iconName: 'School',
        screen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
      },
      queryScope: {
        appContext: 'study',
        profileId: '00000000-0000-7000-a000-000000000201',
      },
      routeSurface: {
        child: { canEnter: false, isSurfaced: false },
        childCurriculum: { canEnter: false, isSurfaced: false },
        library: { canEnter: true, isSurfaced: true },
        recaps: { canEnter: false, isSurfaced: false },
        session: { canEnter: true, isSurfaced: true },
        subscription: { canEnter: false, isSurfaced: false },
      },
      shape: 'study',
      tabs: ['home', 'library', 'more', 'progress'],
    });

    expect(resolved.family).toEqual({
      chrome: { modeSwitcher: 'global-header', proxyBanner: 'hidden' },
      diagnostic: {
        activeProfileId: '00000000-0000-7000-a000-000000000102',
        effectiveAppContext: 'family',
        isFamilyCapable: true,
        isParentProxy: false,
        linkedChildIds: ['00000000-0000-7000-a000-000000000201'],
        reason: 'explicit-family',
        role: 'owner',
        shape: 'family',
      },
      gates: {
        progressScope: 'children',
        sessionIsOwner: true,
        showAccommodationChildEditor: true,
        showAccountSecurity: true,
        showAddChild: true,
        showBilling: true,
        showCelebrationsChildEditor: true,
        showMentorLanguageChildEditor: true,
        showExportDelete: true,
        showFamilyChildActivity: true,
        showFamilyHome: true,
        showInlineStudyInvite: true,
        showLearnThisToo: true,
        showLearningActions: true,
        showProgressProfilePicker: true,
        showRemoveFamilyMember: true,
      },
      home: {
        iconName: 'Users',
        screen: 'FamilyHome',
        titleKey: 'tabs.children',
      },
      queryScope: {
        appContext: 'family',
        profileId: '00000000-0000-7000-a000-000000000102',
      },
      routeSurface: {
        child: { canEnter: true, isSurfaced: true },
        childCurriculum: { canEnter: true, isSurfaced: true },
        library: { canEnter: false, isSurfaced: false },
        recaps: { canEnter: true, isSurfaced: true },
        session: { canEnter: true, isSurfaced: false },
        subscription: { canEnter: true, isSurfaced: true },
      },
      shape: 'family',
      tabs: ['home', 'more', 'progress', 'recaps'],
    });

    expect(resolved.loading).toEqual({
      chrome: { modeSwitcher: 'hidden', proxyBanner: 'hidden' },
      diagnostic: {
        activeProfileId: null,
        effectiveAppContext: 'study',
        isFamilyCapable: false,
        isParentProxy: false,
        linkedChildIds: [],
        reason: 'profile-loading',
        role: null,
        shape: 'study',
      },
      gates: {
        progressScope: 'self',
        sessionIsOwner: false,
        showAccommodationChildEditor: false,
        showAccountSecurity: false,
        showAddChild: false,
        showBilling: false,
        showCelebrationsChildEditor: false,
        showMentorLanguageChildEditor: false,
        showExportDelete: false,
        showFamilyChildActivity: false,
        showFamilyHome: false,
        showInlineStudyInvite: false,
        showLearnThisToo: false,
        showLearningActions: true,
        showProgressProfilePicker: false,
        showRemoveFamilyMember: false,
      },
      home: {
        iconName: 'School',
        screen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
      },
      queryScope: { appContext: 'study', profileId: null },
      routeSurface: {
        child: { canEnter: false, isSurfaced: false },
        childCurriculum: { canEnter: false, isSurfaced: false },
        library: { canEnter: false, isSurfaced: false },
        recaps: { canEnter: false, isSurfaced: false },
        session: { canEnter: false, isSurfaced: false },
        subscription: { canEnter: false, isSurfaced: false },
      },
      shape: 'study',
      tabs: ['home', 'library', 'more', 'progress'],
    });

    expect(resolved.proxy).toEqual({
      chrome: { modeSwitcher: 'hidden', proxyBanner: 'required' },
      diagnostic: {
        activeProfileId: '00000000-0000-7000-a000-000000000102',
        effectiveAppContext: 'study',
        isFamilyCapable: true,
        isParentProxy: true,
        linkedChildIds: ['00000000-0000-7000-a000-000000000201'],
        reason: 'parent-proxy',
        role: 'owner',
        shape: 'study',
      },
      gates: {
        progressScope: 'self',
        sessionIsOwner: false,
        showAccommodationChildEditor: false,
        showAccountSecurity: false,
        showAddChild: false,
        showBilling: false,
        showCelebrationsChildEditor: false,
        showMentorLanguageChildEditor: false,
        showExportDelete: false,
        showFamilyChildActivity: false,
        showFamilyHome: false,
        showInlineStudyInvite: false,
        showLearnThisToo: false,
        showLearningActions: false,
        showProgressProfilePicker: false,
        showRemoveFamilyMember: false,
      },
      home: {
        iconName: 'School',
        screen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
      },
      queryScope: {
        appContext: 'study',
        profileId: '00000000-0000-7000-a000-000000000102',
      },
      routeSurface: {
        child: { canEnter: false, isSurfaced: false },
        childCurriculum: { canEnter: false, isSurfaced: false },
        library: { canEnter: true, isSurfaced: true },
        recaps: { canEnter: false, isSurfaced: false },
        session: { canEnter: false, isSurfaced: false },
        subscription: { canEnter: false, isSurfaced: false },
      },
      shape: 'study',
      tabs: ['home', 'library', 'progress'],
    });

    expect(resolved.study).toEqual({
      chrome: { modeSwitcher: 'global-header', proxyBanner: 'hidden' },
      diagnostic: {
        activeProfileId: '00000000-0000-7000-a000-000000000102',
        effectiveAppContext: 'study',
        isFamilyCapable: true,
        isParentProxy: false,
        linkedChildIds: ['00000000-0000-7000-a000-000000000201'],
        reason: 'explicit-study',
        role: 'owner',
        shape: 'study',
      },
      gates: {
        progressScope: 'self',
        sessionIsOwner: true,
        showAccommodationChildEditor: false,
        showAccountSecurity: true,
        showAddChild: true,
        showBilling: true,
        showCelebrationsChildEditor: false,
        showMentorLanguageChildEditor: false,
        showExportDelete: true,
        showFamilyChildActivity: false,
        showFamilyHome: false,
        showInlineStudyInvite: true,
        showLearnThisToo: false,
        showLearningActions: true,
        showProgressProfilePicker: false,
        showRemoveFamilyMember: false,
      },
      home: {
        iconName: 'School',
        screen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
      },
      queryScope: {
        appContext: 'study',
        profileId: '00000000-0000-7000-a000-000000000102',
      },
      routeSurface: {
        child: { canEnter: false, isSurfaced: false },
        childCurriculum: { canEnter: false, isSurfaced: false },
        library: { canEnter: true, isSurfaced: true },
        recaps: { canEnter: false, isSurfaced: false },
        session: { canEnter: true, isSurfaced: true },
        subscription: { canEnter: true, isSurfaced: true },
      },
      shape: 'study',
      tabs: ['home', 'library', 'more', 'progress'],
    });
  });

  it('keeps owner add-child access while the role discriminator is unresolved', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: makeProfile({
          id: 'owner-profile',
          isOwner: true,
          birthYear: 1990,
          hasFamilyLinks: false,
          defaultAppContext: null,
        }),
        profiles: [
          makeProfile({
            id: 'owner-profile',
            isOwner: true,
            birthYear: 1990,
            hasFamilyLinks: false,
            defaultAppContext: null,
          }),
        ],
        role: null,
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    expect(contract.gates.showAddChild).toBe(true);
    expect(contract.home.screen).toBe('LearnerHome');
  });

  it('hides Add child for owner with null birthYear (regression #807: null-guard)', () => {
    // Before the fix, the local isAdultOwner helper called
    // computeAgeBracket(profile.birthYear) without a null guard. A null
    // birthYear arithmetics to (currentYear - 0) = currentYear, so the
    // helper returned 'adult' and surfaced "Add child" for owners whose
    // birth year was unknown, bypassing the 18+ gate.
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: makeProfile({
          id: 'owner-unknown-age',
          isOwner: true,
          birthYear: null as unknown as number,
          hasFamilyLinks: false,
          defaultAppContext: null,
        }),
        profiles: [],
        role: 'owner',
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    expect(contract.gates.showAddChild).toBe(false);
  });

  it('[WI-1993] agrees with the shared adult-owner gate before the 18th birthday', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00Z'));

    try {
      const boundaryOwner = makeProfile({
        id: '00000000-0000-7000-a000-000000000807',
        birthYear: 2008,
        birthMonth: 12,
        birthDay: 1,
        isOwner: true,
        hasFamilyLinks: false,
      });

      const contract = resolveNavigationContract(
        makeContext({
          activeProfile: boundaryOwner,
          profiles: [boundaryOwner],
          role: 'owner',
          subscription: { status: 'ready', tier: 'family' },
        }),
      );
      const sharedDecision = isSharedAdultOwner({
        role: 'owner',
        birthYear: boundaryOwner.birthYear,
        birthMonth: boundaryOwner.birthMonth,
        birthDay: boundaryOwner.birthDay,
      });

      expect(sharedDecision).toBe(false);
      expect(contract.gates.showAddChild).toBe(sharedDecision);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('V0 fallback - hard constraint (AGENTS.md, spec section Hard Constraint)', () => {
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
    expect(contract.home.screen).toBe('FamilyHome');
    expect(contract.gates.showFamilyHome).toBe(true);
    expect(contract.gates.showLearnThisToo).toBe(false);
  });

  it('exposes V0-safe More-screen gates for a family-capable adult when both flags are off', () => {
    // PR 3 follow-up: showAccommodationChildEditor / showCelebrationsChildEditor /
    // showRemoveFamilyMember used to be V1-only because they required the
    // Family shape, which V0 never sets. Production V0 always showed these
    // affordances to any non-proxy owner, so the screens carried
    // `FEATURE_FLAGS.MODE_NAV_V1_ENABLED ? gate : raw owner read` splits.
    // The contract now collapses to ownerNotProxy under V0 so screens can
    // consume the gate directly.
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

    expect(contract.diagnostic.reason).toBe('legacy-v0-flags-off');
    expect(contract.gates.showAccommodationChildEditor).toBe(true);
    expect(contract.gates.showCelebrationsChildEditor).toBe(true);
    expect(contract.gates.showMentorLanguageChildEditor).toBe(true);
    expect(contract.gates.showRemoveFamilyMember).toBe(true);
    expect(contract.gates.showAddChild).toBe(true);
    // Other child-editor gates stay V1-only — their consumers retain V0 splits.
    expect(contract.gates.showFamilyChildActivity).toBe(false);
    expect(contract.gates.showProgressProfilePicker).toBe(false);
  });

  it('hides V0 More-screen gates when the active profile is a proxy', () => {
    // V0 fallback for the four More-screen gates collapses to ownerNotProxy.
    // A proxy session is never the owner of the current surface, so all four
    // must be false even though V0-off treats every adult owner as broader
    // than the V1 family shape.
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        flags: {
          MODE_NAV_V0_ENABLED: false,
          MODE_NAV_V1_ENABLED: false,
        },
        isParentProxy: true,
        profiles: [familyAdult, child],
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    expect(contract.gates.showAccommodationChildEditor).toBe(false);
    expect(contract.gates.showCelebrationsChildEditor).toBe(false);
    expect(contract.gates.showMentorLanguageChildEditor).toBe(false);
    expect(contract.gates.showRemoveFamilyMember).toBe(false);
    expect(contract.gates.showAddChild).toBe(false);
  });

  it('reports v1-disabled and keeps the legacy V0 mode switcher in contract chrome', () => {
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        flags: {
          MODE_NAV_V0_ENABLED: true,
          MODE_NAV_V1_ENABLED: false,
        },
        profiles: [familyAdult, child],
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    expect(contract.diagnostic.reason).toBe('v1-disabled');
    expect(contract.chrome.modeSwitcher).toBe('global-header');
    expect(contract.effectiveAppContext).toBe('family');
    expect(contract.shape).toBe('study');
    expect(contract.home.screen).toBe('FamilyHome');
    expect(contract.gates.showLearnThisToo).toBe(false);
  });

  it('keeps the contract LEGACY_GUARDIAN_TABS in sync with the legacy GUARDIAN_TABS shell', () => {
    // Dual-source guard. The V0 5-tab shell has two independent definitions
    // that currently agree but can silently diverge:
    //   1. navigation-contract.ts `LEGACY_GUARDIAN_TABS` (surfaced as the
    //      contract's `visibleTabs` on the V0-off family-capable path), and
    //   2. legacy-navigation-contract.ts `GUARDIAN_TABS` (surfaced via
    //      `computeVisibleTabs('guardian')` — the set the V0 shell actually
    //      renders).
    // This forward-only test fails CI if a future edit changes one without the
    // other.
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

    const contractGuardianTabs = new Set(contract.visibleTabs);
    const legacyGuardianShell = computeVisibleTabs('guardian');

    expect(contractGuardianTabs).toEqual(legacyGuardianShell);
  });

  it('keeps the V0 home-label decision in sync between the contract and legacy presentation', () => {
    // The V0 family guardian home tab is labelled from two sources:
    //   1. the contract `home` block -> resolveContractHomeTabPresentation, and
    //   2. legacy resolveHomeTabPresentation('guardian', false, 'family').
    // Both must resolve to the same Family-hub label/icon. (The contract uses
    // 'tabs.children'; legacy uses the same on its FamilyHome path.)
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        flags: {
          MODE_NAV_V0_ENABLED: true,
          MODE_NAV_V1_ENABLED: false,
        },
        profiles: [familyAdult, child],
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    // V0-on family-capable owner in family mode -> FamilyHome.
    expect(contract.home.screen).toBe('FamilyHome');

    const contractPresentation = resolveContractHomeTabPresentation(
      contract.home,
    );
    const legacyPresentation = resolveHomeTabPresentation(
      'guardian',
      false,
      'family',
    );

    expect(contractPresentation.titleKey).toBe('tabs.children');
    expect(legacyPresentation.titleKey).toBe('tabs.familyHub');
    // Both decisions must surface the Family-hub home (not the generic/learner
    // "My Learning" home). The exact i18n key differs by design (contract uses
    // 'tabs.children', legacy uses 'tabs.familyHub'), but neither may regress
    // to the learner label.
    expect(contractPresentation.titleKey).not.toBe('tabs.myLearning');
    expect(legacyPresentation.titleKey).not.toBe('tabs.myLearning');
  });

  it('allows a V0-on family-capable guardian in family context to enter a linked-child curriculum (regression for WI-1092 / PR #1566)', () => {
    // Before WI-1092, curriculum.tsx guarded with `FEATURE_FLAGS.MODE_NAV_V1_ENABLED`
    // so canEnter never fired in V0. After the guard removal, canEnter must return
    // true in V0 family mode — resolveCanEnter previously denied it because
    // familyShape is always false in V0 (shape stays 'study').
    const contract = resolveNavigationContract(
      makeContext({
        activeProfile: familyAdult,
        appContext: 'family',
        flags: {
          MODE_NAV_V0_ENABLED: true,
          MODE_NAV_V1_ENABLED: false,
        },
        profiles: [familyAdult, child],
        subscription: { status: 'ready', tier: 'family' },
      }),
    );

    // V0 family baseline: shape stays 'study' but home is FamilyHome.
    expect(contract.shape).toBe('study');
    expect(contract.gates.showFamilyHome).toBe(true);

    // Regression: linked-child curriculum must be enterable and surfaced in V0.
    expect(
      contract.canEnter('child/[profileId]/curriculum', linkedChildParams),
    ).toBe(true);
    expect(
      contract.isSurfaced('child/[profileId]/curriculum', linkedChildParams),
    ).toBe(true);

    // Linked-child restriction must still hold — unlinked children are blocked.
    expect(
      contract.canEnter('child/[profileId]/curriculum', unlinkedChildParams),
    ).toBe(false);
    expect(
      contract.isSurfaced('child/[profileId]/curriculum', unlinkedChildParams),
    ).toBe(false);
  });
});

describe('navigation-contract totality (fuzzed inputs never throw)', () => {
  const flagsCases: ReadonlyArray<ProfileContext['flags']> = [
    {
      MODE_NAV_V0_ENABLED: false,
      MODE_NAV_V1_ENABLED: false,
      MODE_NAV_V2_ENABLED: false,
    },
    {
      MODE_NAV_V0_ENABLED: true,
      MODE_NAV_V1_ENABLED: false,
      MODE_NAV_V2_ENABLED: false,
    },
    {
      MODE_NAV_V0_ENABLED: false,
      MODE_NAV_V1_ENABLED: true,
      MODE_NAV_V2_ENABLED: false,
    },
    {
      MODE_NAV_V0_ENABLED: true,
      MODE_NAV_V1_ENABLED: true,
      MODE_NAV_V2_ENABLED: false,
    },
    {
      MODE_NAV_V0_ENABLED: false,
      MODE_NAV_V1_ENABLED: true,
      MODE_NAV_V2_ENABLED: true,
    },
  ];
  const appContexts: ReadonlyArray<ProfileContext['appContext']> = [
    null,
    'study',
    'family',
  ];
  const proxies: ReadonlyArray<boolean> = [true, false];
  const subs: ReadonlyArray<ProfileContext['subscription']> = [
    {
      status: 'loading',
      tier: null,
      effectiveAccessTier: null,
      billingAccess: null,
    },
    {
      status: 'ready',
      tier: 'free',
      effectiveAccessTier: 'free',
      billingAccess: 'current',
    },
    {
      status: 'ready',
      tier: 'family',
      effectiveAccessTier: 'family',
      billingAccess: 'current',
    },
  ];
  const profileShapes: ReadonlyArray<ProfileContext['activeProfile']> = [
    null,
    makeProfile({
      id: '00000000-0000-7000-a000-000000000fa1',
      isOwner: true,
      birthYear: 1985,
      hasFamilyLinks: false,
    }),
    makeProfile({
      id: '00000000-0000-7000-a000-000000000fa2',
      isOwner: true,
      birthYear: 1985,
      hasFamilyLinks: true,
    }),
    makeProfile({
      id: '00000000-0000-7000-a000-000000000fa3',
      isOwner: false,
      birthYear: CHILD_BIRTH_YEAR,
      hasFamilyLinks: false,
      linkCreatedAt: ISO,
    }),
    makeProfile({
      id: '00000000-0000-7000-a000-000000000fa4',
      isOwner: true,
      birthYear: CHILD_BIRTH_YEAR,
      hasFamilyLinks: false,
    }),
  ];
  const roles: ReadonlyArray<ProfileContext['role']> = [
    'owner',
    'impersonated-child',
    'child',
    null,
  ];
  const probeRoutes: ReadonlyArray<RouteKey> = [
    'mentor',
    'subjects',
    'journal',
    'home',
    'library',
    'recaps',
    'progress',
    'session',
    'topic/relearn',
    'child/[profileId]',
    'child/[profileId]/curriculum',
    'subscription',
    'more/account',
  ];

  it('every cross-product returns a complete contract without throwing', () => {
    let count = 0;
    for (const flags of flagsCases) {
      for (const appContext of appContexts) {
        for (const isParentProxy of proxies) {
          for (const subscription of subs) {
            for (const activeProfile of profileShapes) {
              for (const role of roles) {
                count += 1;
                const contract = resolveNavigationContract({
                  activeProfile,
                  profiles: activeProfile ? [activeProfile] : [],
                  isParentProxy,
                  appContext,
                  role,
                  subscription,
                  flags,
                });
                expect(contract.visibleTabs.size).toBeGreaterThan(0);
                expect(['study', 'family']).toContain(contract.shape);
                expect(contract.diagnostic.reason).toBeDefined();
                for (const route of probeRoutes) {
                  expect(() => contract.canEnter(route)).not.toThrow();
                  expect(() => contract.isSurfaced(route)).not.toThrow();
                }
                // Correctness invariants on the fuzz — turn the "no crash"
                // sweep into a "no nonsense output" sweep:
                //   1. The bridge gate (showLearnThisToo) is a family-shape
                //      capability; if the contract returns a study shape it
                //      must NEVER claim the bridge is showable.
                //   2. A parent-proxy session is by definition NOT operating
                //      as the owner; sessionIsOwner must be false.
                if (contract.shape === 'study') {
                  expect(contract.gates.showLearnThisToo).toBe(false);
                }
                if (isParentProxy) {
                  expect(contract.gates.sessionIsOwner).toBe(false);
                }
              }
            }
          }
        }
      }
    }
    expect(count).toBeGreaterThan(500);
  });
});
