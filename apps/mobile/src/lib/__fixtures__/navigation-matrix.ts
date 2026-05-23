import type {
  NavigationProfile,
  ProfileContext,
  RouteKey,
  RouteParams,
} from '../navigation-contract';

const ISO = '2026-05-21T00:00:00.000Z';
const ADULT_BIRTH_YEAR = 1985;
const CHILD_BIRTH_YEAR = 2014;

function makeProfile(
  overrides: Partial<NavigationProfile> & { id: string },
): NavigationProfile {
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
  } as NavigationProfile;
}

const ADULT_NO_LINKS = makeProfile({
  id: '00000000-0000-7000-a000-000000000101',
});

const ADULT_FAMILY_DEFAULT_FAMILY = makeProfile({
  id: '00000000-0000-7000-a000-000000000102',
  defaultAppContext: 'family',
  hasFamilyLinks: true,
});

const ADULT_FAMILY_DEFAULT_STUDY = makeProfile({
  id: '00000000-0000-7000-a000-000000000104',
  defaultAppContext: 'study',
  hasFamilyLinks: true,
});

const ADULT_FAMILY_DEFAULT_NULL = makeProfile({
  id: '00000000-0000-7000-a000-000000000105',
  defaultAppContext: null,
  hasFamilyLinks: true,
});

const CHILD_SHARED = makeProfile({
  id: '00000000-0000-7000-a000-000000000201',
  birthYear: CHILD_BIRTH_YEAR,
  isOwner: false,
  linkCreatedAt: ISO,
});

const CHILD_SOLO_OWNER = makeProfile({
  id: '00000000-0000-7000-a000-000000000202',
  birthYear: CHILD_BIRTH_YEAR,
  isOwner: true,
});

const LINKED_CHILD_ID = CHILD_SHARED.id;

const STANDARD_PROBES: ReadonlyArray<{
  route: RouteKey;
  params?: RouteParams;
}> = [
  { route: 'home' },
  { route: 'library' },
  { route: 'recaps' },
  { route: 'progress' },
  { route: 'progress/saved' },
  { route: 'session' },
  { route: 'topic/relearn' },
  { route: 'child/[profileId]', params: { profileId: LINKED_CHILD_ID } },
  {
    route: 'child/[profileId]/curriculum',
    params: { profileId: LINKED_CHILD_ID },
  },
  { route: 'subscription' },
  { route: 'more/account' },
];

export interface MatrixFixture {
  id: string;
  label: string;
  context: ProfileContext;
  probeRoutes: ReadonlyArray<{ route: RouteKey; params?: RouteParams }>;
}

function v1Flags(): ProfileContext['flags'] {
  return { MODE_NAV_V1_ENABLED: true };
}

function readySubscription(
  tier: ProfileContext['subscription']['tier'] = 'free',
): ProfileContext['subscription'] {
  return { status: 'ready', tier };
}

export const matrixFixtures: ReadonlyArray<MatrixFixture> = [
  {
    id: 'row-1',
    label: 'Adult owner, no family links, Study',
    context: {
      activeProfile: ADULT_NO_LINKS,
      profiles: [ADULT_NO_LINKS],
      isParentProxy: false,
      appContext: 'study',
      role: 'owner',
      subscription: readySubscription(),
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-2',
    label: 'Adult owner, no family links, chose Family intent',
    context: {
      activeProfile: ADULT_NO_LINKS,
      profiles: [ADULT_NO_LINKS],
      isParentProxy: false,
      appContext: 'family',
      role: 'owner',
      subscription: readySubscription(),
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-3',
    label: 'Adult owner, family-capable, Study',
    context: {
      activeProfile: ADULT_FAMILY_DEFAULT_FAMILY,
      profiles: [ADULT_FAMILY_DEFAULT_FAMILY, CHILD_SHARED],
      isParentProxy: false,
      appContext: 'study',
      role: 'owner',
      subscription: readySubscription('family'),
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-4',
    label: 'Adult owner, family-capable, explicit Family',
    context: {
      activeProfile: ADULT_FAMILY_DEFAULT_FAMILY,
      profiles: [ADULT_FAMILY_DEFAULT_FAMILY, CHILD_SHARED],
      isParentProxy: false,
      appContext: 'family',
      role: 'owner',
      subscription: readySubscription('family'),
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-5',
    label: 'Adult owner, family-capable, null intent + profile-default Family',
    context: {
      activeProfile: ADULT_FAMILY_DEFAULT_FAMILY,
      profiles: [ADULT_FAMILY_DEFAULT_FAMILY, CHILD_SHARED],
      isParentProxy: false,
      appContext: null,
      role: 'owner',
      subscription: readySubscription('family'),
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-6',
    label: 'Adult owner, family-capable, null intent + profile-default Study',
    context: {
      activeProfile: ADULT_FAMILY_DEFAULT_STUDY,
      profiles: [ADULT_FAMILY_DEFAULT_STUDY, CHILD_SHARED],
      isParentProxy: false,
      appContext: null,
      role: 'owner',
      subscription: readySubscription('family'),
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-7',
    label: 'Parent proxy active',
    context: {
      activeProfile: ADULT_FAMILY_DEFAULT_FAMILY,
      profiles: [ADULT_FAMILY_DEFAULT_FAMILY, CHILD_SHARED],
      isParentProxy: true,
      appContext: 'family',
      role: 'owner',
      subscription: readySubscription('family'),
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-8',
    label: 'Child profile on shared parent account',
    context: {
      activeProfile: CHILD_SHARED,
      profiles: [ADULT_FAMILY_DEFAULT_FAMILY, CHILD_SHARED],
      isParentProxy: false,
      appContext: 'family',
      role: 'child',
      subscription: readySubscription('family'),
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-9',
    label: 'Solo child owner',
    context: {
      activeProfile: CHILD_SOLO_OWNER,
      profiles: [CHILD_SOLO_OWNER],
      isParentProxy: false,
      appContext: 'study',
      role: 'owner',
      subscription: readySubscription(),
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-10',
    label: 'Profile not loaded',
    context: {
      activeProfile: null,
      profiles: [],
      isParentProxy: false,
      appContext: null,
      role: null,
      subscription: { status: 'loading', tier: null },
      flags: v1Flags(),
    },
    probeRoutes: STANDARD_PROBES,
  },
  {
    id: 'row-v0-flags-off',
    label: 'V0 hard constraint: both flags off, family-capable guardian',
    context: {
      activeProfile: ADULT_FAMILY_DEFAULT_NULL,
      profiles: [ADULT_FAMILY_DEFAULT_NULL, CHILD_SHARED],
      isParentProxy: false,
      appContext: null,
      role: 'owner',
      subscription: readySubscription('family'),
      flags: { MODE_NAV_V0_ENABLED: false, MODE_NAV_V1_ENABLED: false },
    },
    probeRoutes: STANDARD_PROBES,
  },
];
