import {
  PROFILE_FACTORY_ADULT_BIRTH_YEAR as ADULT_BIRTH_YEAR,
  PROFILE_FACTORY_CHILD_BIRTH_YEAR as CHILD_BIRTH_YEAR,
  makeProfile,
} from '../test-utils/profile-factories';
import type { ActiveProfileRole } from '../hooks/use-active-profile-role';
import {
  resolveNavigationContract,
  type NavigationAppContext,
  type NavigationContract,
  type NavigationProfile,
  type ProfileContext,
  type RouteKey,
  type TabKey,
} from './navigation-contract';

// Per spec §Enforcement (docs/specs/2026-05-21-navigation-contract.md:480):
// "Totality/property test: fuzzed inputs never throw and always return a
// complete contract."
//
// This test fuzzes every input dimension of `resolveNavigationContract` and
// asserts the function is total (never throws), the output shape is complete,
// and the cross-field invariants stated in the spec hold for every sample.

const ITERATIONS = 2000;
const SEED = 0xa53f_71c1;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const rand = mulberry32(SEED);
const pick = <T>(items: ReadonlyArray<T>): T =>
  items[Math.floor(rand() * items.length)]!;
const bool = (): boolean => rand() < 0.5;
const maybe = <T>(value: T): T | null => (rand() < 0.5 ? value : null);

const APP_CONTEXTS: ReadonlyArray<NavigationAppContext | null> = [
  'study',
  'family',
  null,
];
const ROLES: ReadonlyArray<ActiveProfileRole | null> = [
  'owner',
  'impersonated-child',
  'child',
  null,
];
const SUB_STATUSES: ReadonlyArray<ProfileContext['subscription']['status']> = [
  'loading',
  'ready',
];
const SUB_TIERS: ReadonlyArray<ProfileContext['subscription']['tier']> = [
  'free',
  'plus',
  'family',
  'pro',
  null,
];
const BIRTH_YEARS: ReadonlyArray<number> = [
  ADULT_BIRTH_YEAR,
  1970,
  1995,
  2005,
  CHILD_BIRTH_YEAR,
  2018,
];

const KNOWN_TAB_KEYS: ReadonlyArray<TabKey> = [
  'home',
  'own-learning',
  'library',
  'recaps',
  'progress',
  'more',
];

const ALL_ROUTE_KEYS: ReadonlyArray<RouteKey> = [
  'mentor',
  'subjects',
  'journal',
  'home',
  'own-learning',
  'library',
  'recaps',
  'recaps/[recapId]',
  'progress',
  'progress/saved',
  'progress/vocabulary',
  'session',
  'homework',
  'dictation',
  'quiz',
  'practice',
  'mentor-memory',
  'topic/relearn',
  'child/[profileId]',
  'child/[profileId]/reports',
  'child/[profileId]/reports/weekly',
  'child/[profileId]/curriculum',
  'child/[profileId]/session/[sessionId]',
  'create-profile',
  'subscription',
  'more/account',
  'more/privacy',
];

const STUDY_TABS = new Set<TabKey>(['home', 'library', 'progress', 'more']);
const FAMILY_TABS = new Set<TabKey>(['home', 'recaps', 'progress', 'more']);
const PROXY_TABS = new Set<TabKey>(['home', 'library', 'progress']);
const LEGACY_GUARDIAN_TABS = new Set<TabKey>([
  'home',
  'own-learning',
  'library',
  'progress',
  'more',
]);

function tabKey(prefix: string, n: number): string {
  return `00000000-0000-7000-a000-${prefix}${n.toString().padStart(8, '0')}`;
}

function makeRandomProfile(seed: number): NavigationProfile {
  return makeProfile({
    id: tabKey('5000', seed),
    birthYear: pick(BIRTH_YEARS),
    isOwner: bool(),
    defaultAppContext: maybe(pick(['study', 'family'] as const)),
    hasFamilyLinks: bool(),
    linkCreatedAt: bool() ? '2026-05-21T00:00:00.000Z' : null,
  });
}

function makeRandomContext(i: number): ProfileContext {
  const activeProfile: NavigationProfile | null = bool()
    ? makeRandomProfile(i)
    : null;
  const subscriptionStatus = pick(SUB_STATUSES);
  const subscriptionTier = pick(SUB_TIERS);
  const linkedCount = Math.floor(rand() * 4);
  const profiles: NavigationProfile[] = [];
  if (activeProfile) profiles.push(activeProfile);
  for (let k = 0; k < linkedCount; k++) {
    profiles.push(makeRandomProfile(i * 100 + k + 1));
  }

  return {
    activeProfile,
    profiles,
    isParentProxy: bool(),
    appContext: pick(APP_CONTEXTS),
    role: pick(ROLES),
    subscription: {
      status: subscriptionStatus,
      tier: subscriptionTier,
      effectiveAccessTier:
        subscriptionStatus === 'ready' ? subscriptionTier : null,
      billingAccess:
        subscriptionStatus === 'ready' && subscriptionTier !== null
          ? 'current'
          : null,
    },
    flags: {
      MODE_NAV_V0_ENABLED: bool(),
      MODE_NAV_V1_ENABLED: bool(),
      MODE_NAV_V2_ENABLED: bool(),
    },
  };
}

function assertCompleteContract(
  contract: NavigationContract,
  ctx: ProfileContext,
): void {
  // Top-level enum fields.
  expect(['study', 'family']).toContain(contract.shape);
  expect(['study', 'family']).toContain(contract.effectiveAppContext);
  expect(typeof contract.isFamilyCapable).toBe('boolean');
  expect(typeof contract.isParentProxy).toBe('boolean');

  // visibleTabs is always one of the four known sets.
  const tabs = [...contract.visibleTabs];
  for (const t of tabs) expect(KNOWN_TAB_KEYS).toContain(t);
  const tabsSorted = tabs.slice().sort();
  const matchesKnownShape = [
    STUDY_TABS,
    FAMILY_TABS,
    PROXY_TABS,
    LEGACY_GUARDIAN_TABS,
  ].some(
    (known) =>
      tabsSorted.length === known.size && tabsSorted.every((t) => known.has(t)),
  );
  expect(matchesKnownShape).toBe(true);

  // home triple is internally consistent.
  expect(['LearnerHome', 'FamilyHome']).toContain(contract.home.screen);
  if (contract.home.screen === 'FamilyHome') {
    expect(contract.home.titleKey).toBe('tabs.children');
    expect(contract.home.iconName).toBe('Users');
  } else {
    expect(contract.home.titleKey).toBe('tabs.myLearning');
    expect(contract.home.iconName).toBe('School');
  }

  // chrome.
  expect(['global-header', 'hidden']).toContain(contract.chrome.modeSwitcher);
  expect(['required', 'hidden']).toContain(contract.chrome.proxyBanner);
  // proxyBanner === 'required' ⇒ proxy active AND a profile is loaded.
  if (contract.chrome.proxyBanner === 'required') {
    expect(ctx.isParentProxy).toBe(true);
    expect(ctx.activeProfile).not.toBeNull();
  }

  // gates — every advertised gate is a boolean, progressScope is bounded.
  const gateBooleanKeys: ReadonlyArray<keyof NavigationContract['gates']> = [
    'sessionIsOwner',
    'showFamilyHome',
    'showLearningActions',
    'showBilling',
    'showAccountSecurity',
    'showExportDelete',
    'showAddChild',
    'showRemoveFamilyMember',
    'showFamilyChildActivity',
    'showProgressProfilePicker',
    'showAccommodationChildEditor',
    'showCelebrationsChildEditor',
    'showInlineStudyInvite',
    'showLearnThisToo',
  ];
  for (const k of gateBooleanKeys) {
    expect(typeof contract.gates[k]).toBe('boolean');
  }
  expect(['self', 'children']).toContain(contract.gates.progressScope);

  // canEnter / isSurfaced are total over every known route, with and without
  // a representative `params` payload.
  const probeParams = [
    undefined,
    { for: 'child' as const },
    { for: 'self' as const },
    { profileId: tabKey('5000', 1) },
  ];
  for (const route of ALL_ROUTE_KEYS) {
    for (const params of probeParams) {
      const canEnter = contract.canEnter(route, params);
      const isSurfaced = contract.isSurfaced(route, params);
      expect(typeof canEnter).toBe('boolean');
      expect(typeof isSurfaced).toBe('boolean');
      // Surfacing implies entry — a tab can't link to a route the guard
      // would reject. (Spec §Route Reachability.)
      if (isSurfaced) expect(canEnter).toBe(true);
    }
  }

  // queryScope mirrors effectiveAppContext + activeProfile id.
  expect(contract.queryScope.appContext).toBe(contract.effectiveAppContext);
  expect(contract.queryScope.profileId).toBe(ctx.activeProfile?.id ?? null);

  // diagnostic is structurally complete.
  expect(contract.diagnostic.shape).toBe(contract.shape);
  expect(contract.diagnostic.effectiveAppContext).toBe(
    contract.effectiveAppContext,
  );
  expect(contract.diagnostic.isFamilyCapable).toBe(contract.isFamilyCapable);
  expect(contract.diagnostic.isParentProxy).toBe(contract.isParentProxy);
  expect(contract.diagnostic.activeProfileId).toBe(
    ctx.activeProfile?.id ?? null,
  );
  expect(Array.isArray(contract.diagnostic.linkedChildIds)).toBe(true);
  expect([
    'child-study-only',
    'explicit-family',
    'explicit-study',
    'family-intent-without-family-links',
    'legacy-v0-flags-off',
    'parent-proxy',
    'profile-default-family',
    'profile-loading',
    'v1-disabled',
  ]).toContain(contract.diagnostic.reason);
  expect(contract.diagnostic.role).toBe(ctx.role);
}

function assertSpecInvariants(
  contract: NavigationContract,
  ctx: ProfileContext,
): void {
  const tabs = contract.visibleTabs;
  const tabSet = new Set(tabs);

  // Hard constraint (spec §Hard Constraint): V0=off + V1=off + adult owner
  // with at least one linked non-owner profile + not proxy ⇒ 5-tab legacy
  // guardian shell. Memory `project_nav_contract_preserve_v0_off.md`.
  const v0Off = ctx.flags.MODE_NAV_V0_ENABLED === false;
  const v1Off = ctx.flags.MODE_NAV_V1_ENABLED === false;
  const hasLinkedNonOwner =
    !!ctx.activeProfile &&
    ctx.profiles.some((p) => p.id !== ctx.activeProfile!.id && !p.isOwner);
  const isLegacyGuardian =
    !!ctx.activeProfile && ctx.activeProfile.isOwner && hasLinkedNonOwner;
  if (v0Off && v1Off && isLegacyGuardian && !ctx.isParentProxy) {
    expect(tabs.size).toBe(LEGACY_GUARDIAN_TABS.size);
    for (const t of LEGACY_GUARDIAN_TABS) expect(tabSet.has(t)).toBe(true);
  }

  // V1 on ⇒ `own-learning` is never a tab.
  if (ctx.flags.MODE_NAV_V1_ENABLED === true) {
    expect(tabSet.has('own-learning')).toBe(false);
  }

  // Family shape ⇒ exactly the family tab set.
  if (contract.shape === 'family') {
    expect(tabSet.size).toBe(FAMILY_TABS.size);
    for (const t of FAMILY_TABS) expect(tabSet.has(t)).toBe(true);
    expect(contract.gates.progressScope).toBe('children');
  }

  // Proxy banner is required whenever the user is in proxy with a profile
  // loaded — regardless of the V0/V1 flag state.
  if (ctx.isParentProxy && ctx.activeProfile) {
    expect(contract.chrome.proxyBanner).toBe('required');
  }

  // Proxy tab set (`home, library, progress` — no `more`) is V1-specific. In
  // V1-off states the contract intentionally returns `v1-disabled` with the
  // default Study tabs so legacy V0 code paths handle the proxy shell.
  if (
    ctx.isParentProxy &&
    ctx.activeProfile &&
    ctx.flags.MODE_NAV_V1_ENABLED === true
  ) {
    expect(tabSet.has('more')).toBe(false);
  }

  // Mode switcher is hidden in proxy regardless of capability.
  if (ctx.isParentProxy) {
    expect(contract.chrome.modeSwitcher).toBe('hidden');
  }

  // diagnostic.linkedChildIds excludes the active profile and only contains
  // non-owner profile IDs.
  if (ctx.activeProfile) {
    expect(contract.diagnostic.linkedChildIds).not.toContain(
      ctx.activeProfile.id,
    );
  }
  const profileIds = new Map(ctx.profiles.map((p) => [p.id, p]));
  for (const id of contract.diagnostic.linkedChildIds) {
    const profile = profileIds.get(id);
    expect(profile).toBeDefined();
    expect(profile!.isOwner).toBe(false);
  }
}

describe('resolveNavigationContract totality/fuzz', () => {
  it(`is total over ${ITERATIONS} randomized inputs (seed ${SEED.toString(16)})`, () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const ctx = makeRandomContext(i);
      let contract: NavigationContract;
      try {
        contract = resolveNavigationContract(ctx);
      } catch (err) {
        throw new Error(
          `resolveNavigationContract threw on iteration ${i}: ${
            (err as Error).message
          }\nInput: ${JSON.stringify(ctx)}`,
        );
      }

      try {
        assertCompleteContract(contract, ctx);
        assertSpecInvariants(contract, ctx);
      } catch (err) {
        throw new Error(
          `Contract invariant violated on iteration ${i}: ${
            (err as Error).message
          }\nInput: ${JSON.stringify(ctx)}`,
        );
      }
    }
  });

  // Targeted regressions for input shapes that easy uniform fuzzing under-
  // samples (null active profile, both flags off + legacy guardian, etc.).
  // These don't replace the loop above — they guarantee coverage of corners
  // the spec calls out explicitly.
  it.each([
    {
      name: 'no active profile',
      ctx: {
        activeProfile: null,
        profiles: [],
        isParentProxy: false,
        appContext: null,
        role: null,
        subscription: {
          status: 'loading',
          tier: null,
          effectiveAccessTier: null,
          billingAccess: null,
        },
        flags: { MODE_NAV_V1_ENABLED: true },
      } satisfies ProfileContext,
    },
    {
      name: 'V0+V1 both off, legacy guardian',
      ctx: ((): ProfileContext => {
        const adult = makeProfile({
          id: '00000000-0000-7000-a000-000000099001',
        });
        const child = makeProfile({
          id: '00000000-0000-7000-a000-000000099002',
          birthYear: CHILD_BIRTH_YEAR,
          isOwner: false,
          linkCreatedAt: '2026-05-21T00:00:00.000Z',
        });
        return {
          activeProfile: adult,
          profiles: [adult, child],
          isParentProxy: false,
          appContext: null,
          role: 'owner',
          subscription: {
            status: 'ready',
            tier: 'free',
            effectiveAccessTier: 'free',
            billingAccess: 'current',
          },
          flags: { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: false },
        };
      })(),
    },
    {
      name: 'parent proxy on, no profile',
      ctx: {
        activeProfile: null,
        profiles: [],
        isParentProxy: true,
        appContext: 'family',
        role: 'impersonated-child',
        subscription: {
          status: 'ready',
          tier: 'family',
          effectiveAccessTier: 'family',
          billingAccess: 'current',
        },
        flags: { MODE_NAV_V1_ENABLED: true },
      } satisfies ProfileContext,
    },
  ])('handles corner case: $name without throwing', ({ ctx }) => {
    const contract = resolveNavigationContract(ctx);
    assertCompleteContract(contract, ctx);
    assertSpecInvariants(contract, ctx);
  });
});
