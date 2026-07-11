import {
  resolveNavigationContract,
  type NavigationAppContext,
  type NavigationProfile,
  type ProfileContext,
  type RouteKey,
  type RouteParams,
} from './navigation-contract';
import type { ActiveProfileRole } from '../hooks/use-active-profile-role';
import type { SubscriptionTier } from '@eduagent/schemas';

const ISO = '2026-05-21T00:00:00.000Z';

function makeProfile(
  overrides: Partial<NavigationProfile> & { id: string },
): NavigationProfile {
  return {
    accountId: '00000000-0000-7000-a000-000000000001',
    avatarUrl: null,
    birthYear: 1985,
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
  } as NavigationProfile;
}

const PROFILE_POOL: ReadonlyArray<NavigationProfile | null> = [
  null,
  makeProfile({ id: 'p-adult-no-links' }),
  makeProfile({
    id: 'p-adult-family-default-family',
    defaultAppContext: 'family',
    hasFamilyLinks: true,
  }),
  makeProfile({
    id: 'p-adult-family-default-study',
    defaultAppContext: 'study',
    hasFamilyLinks: true,
  }),
  makeProfile({
    id: 'p-adult-family-default-null',
    defaultAppContext: null,
    hasFamilyLinks: true,
  }),
  makeProfile({
    id: 'p-child-shared',
    birthYear: 2014,
    isOwner: false,
    linkCreatedAt: ISO,
  }),
  makeProfile({ id: 'p-child-solo-owner', birthYear: 2014 }),
  makeProfile({ id: 'p-teen-owner', birthYear: 2012 }),
];

const LINKED_CHILD = makeProfile({
  id: 'p-linked-child',
  birthYear: 2014,
  isOwner: false,
  linkCreatedAt: ISO,
});

const APP_CONTEXTS: ReadonlyArray<NavigationAppContext | null> = [
  null,
  'study',
  'family',
];
const ROLES: ReadonlyArray<ActiveProfileRole | null> = [
  null,
  'owner',
  'impersonated-child',
  'child',
];
const SUB_STATUS: ReadonlyArray<'loading' | 'ready'> = ['loading', 'ready'];
const SUB_TIERS: ReadonlyArray<SubscriptionTier | null> = [
  null,
  'free',
  'plus',
  'family',
  'pro',
];
const BOOLS = [false, true] as const;

const ALL_ROUTES: ReadonlyArray<RouteKey> = [
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
  'session-summary/[sessionId]',
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

const PROBE_PARAMS: ReadonlyArray<RouteParams | undefined> = [
  undefined,
  { for: 'child' },
  { for: 'self' },
  { profileId: LINKED_CHILD.id },
  { profileId: 'unlinked-child' },
  { sessionId: 'session-1' },
  { recapId: 'recap-1' },
];

const VALID_TAB_KEYS = new Set([
  'home',
  'own-learning',
  'library',
  'recaps',
  'progress',
  'more',
]);

const VALID_REASONS = new Set([
  'child-study-only',
  'explicit-family',
  'explicit-study',
  'family-intent-without-family-links',
  'legacy-v0-flags-off',
  'parent-proxy',
  'profile-default-family',
  'profile-loading',
  'v1-disabled',
]);

// Seeded LCG so failures are reproducible.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pick<T>(rng: () => number, values: ReadonlyArray<T>): T {
  return values[Math.floor(rng() * values.length)] as T;
}

function randomContext(rng: () => number): ProfileContext {
  const activeProfile = pick(rng, PROFILE_POOL);
  const includeChild = rng() < 0.5;
  const subscriptionStatus = pick(rng, SUB_STATUS);
  const subscriptionTier = pick(rng, SUB_TIERS);
  const profiles: NavigationProfile[] = [];
  if (activeProfile) profiles.push(activeProfile);
  if (includeChild && activeProfile?.id !== LINKED_CHILD.id) {
    profiles.push(LINKED_CHILD);
  }
  return {
    activeProfile,
    profiles,
    isParentProxy: pick(rng, BOOLS),
    appContext: pick(rng, APP_CONTEXTS),
    role: pick(rng, ROLES),
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
      MODE_NAV_V0_ENABLED: pick(rng, BOOLS),
      MODE_NAV_V1_ENABLED: pick(rng, BOOLS),
      MODE_NAV_V2_ENABLED: pick(rng, BOOLS),
    },
  };
}

describe('resolveNavigationContract — totality', () => {
  it('never throws and returns a structurally complete contract for 1000 fuzzed inputs', () => {
    const rng = makeRng(0xc0ffee);
    const failures: Array<{ context: ProfileContext; error: unknown }> = [];

    for (let i = 0; i < 1000; i += 1) {
      const context = randomContext(rng);
      try {
        const contract = resolveNavigationContract(context);

        // Top-level fields present.
        expect(contract.shape === 'study' || contract.shape === 'family').toBe(
          true,
        );
        expect(
          contract.effectiveAppContext === 'study' ||
            contract.effectiveAppContext === 'family',
        ).toBe(true);
        expect(typeof contract.isFamilyCapable).toBe('boolean');
        expect(typeof contract.isParentProxy).toBe('boolean');

        // visibleTabs is a Set with only valid TabKey members.
        expect(contract.visibleTabs).toBeInstanceOf(Set);
        for (const tab of contract.visibleTabs) {
          expect(VALID_TAB_KEYS.has(tab)).toBe(true);
        }

        // home / chrome enums.
        expect(
          contract.home.screen === 'LearnerHome' ||
            contract.home.screen === 'FamilyHome',
        ).toBe(true);
        expect(
          contract.chrome.modeSwitcher === 'global-header' ||
            contract.chrome.modeSwitcher === 'hidden',
        ).toBe(true);
        expect(
          contract.chrome.proxyBanner === 'required' ||
            contract.chrome.proxyBanner === 'hidden',
        ).toBe(true);

        // gates: all named booleans + progressScope enum.
        const boolGates: ReadonlyArray<keyof typeof contract.gates> = [
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
          'showMentorLanguageChildEditor',
          'showInlineStudyInvite',
          'showLearnThisToo',
        ];
        for (const key of boolGates) {
          expect(typeof contract.gates[key]).toBe('boolean');
        }
        expect(
          contract.gates.progressScope === 'self' ||
            contract.gates.progressScope === 'children',
        ).toBe(true);

        // queryScope.
        expect(
          contract.queryScope.appContext === 'study' ||
            contract.queryScope.appContext === 'family',
        ).toBe(true);
        expect(
          contract.queryScope.profileId === null ||
            typeof contract.queryScope.profileId === 'string',
        ).toBe(true);

        // diagnostic.reason is in the allowed enum.
        expect(VALID_REASONS.has(contract.diagnostic.reason)).toBe(true);

        // canEnter / isSurfaced are total over the full route × param product.
        for (const route of ALL_ROUTES) {
          for (const params of PROBE_PARAMS) {
            const can = contract.canEnter(route, params);
            const surf = contract.isSurfaced(route, params);
            expect(typeof can).toBe('boolean');
            expect(typeof surf).toBe('boolean');
            // isSurfaced ⊆ canEnter — a surfaced route must also be enterable.
            if (surf) expect(can).toBe(true);
          }
        }
      } catch (error) {
        failures.push({ context, error });
      }
    }

    if (failures.length > 0) {
      const sample = failures.slice(0, 3).map((f) => ({
        error: f.error instanceof Error ? f.error.message : String(f.error),
        context: {
          ...f.context,
          activeProfile: f.context.activeProfile?.id ?? null,
          profiles: f.context.profiles.map((p) => p.id),
        },
      }));
      throw new Error(
        `${failures.length}/1000 fuzz iterations threw. Sample:\n${JSON.stringify(sample, null, 2)}`,
      );
    }
  });
});
