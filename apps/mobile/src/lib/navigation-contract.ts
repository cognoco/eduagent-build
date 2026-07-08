import {
  isAdultOwner as isAdultOwnerSchema,
  type BillingAccess,
  type Profile,
  type SubscriptionTier,
} from '@eduagent/schemas';

import type { ActiveProfileRole } from '../hooks/use-active-profile-role';
import type { AppMode } from './app-context';

export type NavigationAppContext = AppMode;
export type NavigationShape = 'study' | 'family';
export type TabKey =
  | 'mentor'
  | 'subjects'
  | 'journal'
  | 'home'
  | 'own-learning'
  | 'library'
  | 'recaps'
  | 'progress'
  | 'more';

export type RouteKey =
  | 'mentor'
  | 'subjects'
  | 'journal'
  | 'home'
  | 'own-learning'
  | 'library'
  | 'recaps'
  | 'recaps/[recapId]'
  | 'progress'
  | 'progress/saved'
  | 'progress/vocabulary'
  | 'session'
  | 'homework'
  | 'dictation'
  | 'quiz'
  | 'practice'
  | 'mentor-memory'
  | 'session-summary/[sessionId]'
  | 'topic/relearn'
  | 'child/[profileId]'
  | 'child/[profileId]/reports'
  | 'child/[profileId]/reports/weekly'
  | 'child/[profileId]/curriculum'
  | 'child/[profileId]/session/[sessionId]'
  | 'create-profile'
  | 'subscription'
  | 'more/account'
  | 'more/privacy';

export interface RouteParams {
  for?: 'child' | 'self';
  profileId?: string;
  recapId?: string;
  sessionId?: string;
}

export type NavigationProfile = Profile & {
  defaultAppContext?: NavigationAppContext | null;
  hasFamilyLinks?: boolean | null;
};

export interface NavigationFlags {
  MODE_NAV_V0_ENABLED?: boolean;
  MODE_NAV_V1_ENABLED: boolean;
  MODE_NAV_V2_ENABLED?: boolean;
}

export interface NavigationSubscriptionContext {
  status: 'loading' | 'ready';
  tier: SubscriptionTier | null;
  effectiveAccessTier: SubscriptionTier | null;
  billingAccess: BillingAccess | null;
}

export interface ProfileContext {
  activeProfile: NavigationProfile | null;
  profiles: ReadonlyArray<NavigationProfile>;
  isParentProxy: boolean;
  appContext: NavigationAppContext | null;
  role: ActiveProfileRole | null;
  subscription: NavigationSubscriptionContext;
  flags: NavigationFlags;
}

export interface NavigationGates {
  sessionIsOwner: boolean;
  showFamilyHome: boolean;
  showLearningActions: boolean;
  showBilling: boolean;
  showAccountSecurity: boolean;
  showExportDelete: boolean;
  showAddChild: boolean;
  showRemoveFamilyMember: boolean;
  showFamilyChildActivity: boolean;
  showProgressProfilePicker: boolean;
  showAccommodationChildEditor: boolean;
  showCelebrationsChildEditor: boolean;
  showInlineStudyInvite: boolean;
  showLearnThisToo: boolean;
  progressScope: 'self' | 'children';
}

export interface NavigationDiagnostic {
  activeProfileId: string | null;
  effectiveAppContext: NavigationAppContext;
  isFamilyCapable: boolean;
  isParentProxy: boolean;
  linkedChildIds: string[];
  reason:
    | 'child-study-only'
    | 'explicit-family'
    | 'explicit-study'
    | 'family-intent-without-family-links'
    | 'legacy-v0-flags-off'
    | 'parent-proxy'
    | 'profile-default-family'
    | 'profile-loading'
    | 'v1-disabled';
  role: ActiveProfileRole | null;
  shape: NavigationShape;
}

export interface NavigationContract {
  shape: NavigationShape;
  effectiveAppContext: NavigationAppContext;
  isFamilyCapable: boolean;
  isParentProxy: boolean;
  visibleTabs: ReadonlySet<TabKey>;
  home: {
    screen: 'LearnerHome' | 'FamilyHome';
    titleKey: 'tabs.myLearning' | 'tabs.children';
    iconName: 'School' | 'Users';
  };
  chrome: {
    modeSwitcher: 'global-header' | 'hidden';
    proxyBanner: 'required' | 'hidden';
  };
  gates: NavigationGates;
  canEnter: (route: RouteKey, params?: RouteParams) => boolean;
  isSurfaced: (route: RouteKey, params?: RouteParams) => boolean;
  queryScope: {
    appContext: NavigationAppContext;
    profileId: string | null;
  };
  diagnostic: NavigationDiagnostic;
}

const STUDY_TABS: ReadonlySet<TabKey> = new Set([
  'home',
  'library',
  'progress',
  'more',
]);
const FAMILY_TABS: ReadonlySet<TabKey> = new Set([
  'home',
  'recaps',
  'progress',
  'more',
]);
const PROXY_TABS: ReadonlySet<TabKey> = new Set([
  'home',
  'library',
  'progress',
]);
const LEGACY_GUARDIAN_TABS: ReadonlySet<TabKey> = new Set([
  'home',
  'own-learning',
  'library',
  'progress',
  'more',
]);

const V2_ROUTES = new Set<RouteKey>(['mentor', 'subjects', 'journal']);

const LEARNING_ROUTES = new Set<RouteKey>([
  'session',
  'homework',
  'dictation',
  'quiz',
  'practice',
  'mentor-memory',
  'session-summary/[sessionId]',
  'topic/relearn',
]);

const FAMILY_CHILD_ROUTES = new Set<RouteKey>([
  'child/[profileId]',
  'child/[profileId]/reports',
  'child/[profileId]/reports/weekly',
  'child/[profileId]/curriculum',
  'child/[profileId]/session/[sessionId]',
]);

function getLinkedChildIds(
  activeProfile: NavigationProfile | null,
  profiles: ReadonlyArray<NavigationProfile>,
): string[] {
  if (!activeProfile) return [];
  return profiles
    .filter((profile) => profile.id !== activeProfile.id && !profile.isOwner)
    .map((profile) => profile.id);
}

function isAdultOwner(profile: NavigationProfile | null): boolean {
  return isAdultOwnerSchema(profile);
}

function isFamilyCapable(activeProfile: NavigationProfile | null): boolean {
  if (!activeProfile || !isAdultOwner(activeProfile)) return false;
  return activeProfile.hasFamilyLinks === true;
}

export function isFamilyHubEligible(context: ProfileContext): boolean {
  if (!isAdultOwner(context.activeProfile)) return false;
  if (context.role !== 'owner') return false;
  if (context.isParentProxy) return false;
  if (getLinkedChildIds(context.activeProfile, context.profiles).length < 1) {
    return false;
  }
  if (context.subscription.status !== 'ready') return false;
  return context.subscription.effectiveAccessTier !== null;
}

function isLegacyGuardian(
  activeProfile: NavigationProfile | null,
  linkedChildIds: ReadonlyArray<string>,
): boolean {
  return !!activeProfile?.isOwner && linkedChildIds.length > 0;
}

function isLegacyV0FamilyCapable(
  activeProfile: NavigationProfile | null,
  linkedChildIds: ReadonlyArray<string>,
): boolean {
  return isAdultOwner(activeProfile) && linkedChildIds.length > 0;
}

function isLinkedChildRoute(
  params: RouteParams | undefined,
  linkedChildIds: ReadonlyArray<string>,
): boolean {
  return !!params?.profileId && linkedChildIds.includes(params.profileId);
}

function isOwnerRole(role: ActiveProfileRole | null): boolean {
  return role === 'owner';
}

interface NavigationShapeResolution {
  shape: NavigationShape;
  effectiveAppContext: NavigationAppContext;
  reason: NavigationDiagnostic['reason'];
  visibleTabs: ReadonlySet<TabKey>;
  linkedChildIds: string[];
  familyCapable: boolean;
  ownerRole: boolean;
  addChildOwnerRole: boolean;
  subscriptionReady: boolean;
  familyHubEligible: boolean;
  legacyV0ModeNavActive: boolean;
  legacyV0FamilyCapable: boolean;
}

export function resolveShape(
  context: ProfileContext,
): NavigationShapeResolution {
  const linkedChildIds = getLinkedChildIds(
    context.activeProfile,
    context.profiles,
  );
  const familyCapable = isFamilyCapable(context.activeProfile);
  const ownerRole = isOwnerRole(context.role);
  const addChildOwnerRole =
    ownerRole || (context.role === null && isAdultOwner(context.activeProfile));
  const subscriptionReady = context.subscription.status === 'ready';
  const familyHubEligible = isFamilyHubEligible(context);
  const legacyV0ModeNavActive =
    context.flags.MODE_NAV_V1_ENABLED === false &&
    context.flags.MODE_NAV_V0_ENABLED === true;
  const legacyV0FamilyCapable = isLegacyV0FamilyCapable(
    context.activeProfile,
    linkedChildIds,
  );

  let shape: NavigationShape = 'study';
  let effectiveAppContext: NavigationAppContext = 'study';
  let reason: NavigationDiagnostic['reason'] = 'explicit-study';
  let visibleTabs: ReadonlySet<TabKey> = STUDY_TABS;

  if (!context.activeProfile) {
    reason = 'profile-loading';
  } else if (
    context.flags.MODE_NAV_V1_ENABLED === false &&
    context.flags.MODE_NAV_V0_ENABLED === false &&
    isLegacyGuardian(context.activeProfile, linkedChildIds) &&
    !context.isParentProxy
  ) {
    // Legacy V0 fallback: shape stays 'study' so V1-only family child routes
    // stay closed, while the home contract below still reports FamilyHome for
    // the production guardian surface. visibleTabs preserves the 5-tab shell.
    reason = 'legacy-v0-flags-off';
    visibleTabs = LEGACY_GUARDIAN_TABS;
  } else if (context.flags.MODE_NAV_V1_ENABLED === false) {
    reason = 'v1-disabled';
    if (
      legacyV0ModeNavActive &&
      legacyV0FamilyCapable &&
      !context.isParentProxy &&
      context.appContext !== null
    ) {
      effectiveAppContext = context.appContext;
    }
  } else if (context.isParentProxy) {
    reason = 'parent-proxy';
    visibleTabs = PROXY_TABS;
  } else if (!context.activeProfile.isOwner) {
    reason = 'child-study-only';
  } else if (context.appContext === 'family' && familyCapable) {
    shape = 'family';
    effectiveAppContext = 'family';
    reason = 'explicit-family';
    visibleTabs = FAMILY_TABS;
  } else if (context.appContext === 'family' && !familyCapable) {
    reason = 'family-intent-without-family-links';
  } else if (
    context.appContext === null &&
    familyCapable &&
    context.activeProfile.defaultAppContext === 'family'
  ) {
    shape = 'family';
    effectiveAppContext = 'family';
    reason = 'profile-default-family';
    visibleTabs = FAMILY_TABS;
  }

  return {
    shape,
    effectiveAppContext,
    reason,
    visibleTabs,
    linkedChildIds,
    familyCapable,
    ownerRole,
    addChildOwnerRole,
    subscriptionReady,
    familyHubEligible,
    legacyV0ModeNavActive,
    legacyV0FamilyCapable,
  };
}

export function resolveGates(
  context: ProfileContext,
  resolution: NavigationShapeResolution,
): NavigationGates {
  const {
    shape,
    familyCapable,
    ownerRole,
    addChildOwnerRole,
    subscriptionReady,
    familyHubEligible,
    legacyV0ModeNavActive,
    legacyV0FamilyCapable,
    linkedChildIds,
  } = resolution;
  const familyShape = shape === 'family';
  const isV1 = context.flags.MODE_NAV_V1_ENABLED === true;
  const ownerNotProxy = ownerRole && !context.isParentProxy;
  const addChildGate = isV1
    ? isAdultOwner(context.activeProfile) &&
      addChildOwnerRole &&
      !context.isParentProxy &&
      subscriptionReady &&
      context.activeProfile !== null
    : isAdultOwner(context.activeProfile) && ownerNotProxy;
  const childEditorGate = ownerRole && familyShape && !context.isParentProxy;
  // More-screen child editors (accommodation/celebrations) and the linked-
  // child removal/withdrawal-archive gate were previously V1-only because
  // they required `familyShape`, which V0 never sets. V0's production
  // behavior is broader — any owner (not in proxy) sees these affordances —
  // so the V0 evaluation collapses to ownerNotProxy. This lets screens drop
  // their `MODE_NAV_V1_ENABLED ? gate : raw owner read` splits.
  const moreScreenChildEditorGate = isV1 ? childEditorGate : ownerNotProxy;
  const removeFamilyMemberGate = isV1
    ? childEditorGate && familyCapable
    : ownerNotProxy;
  const learnThisTooGate =
    ownerRole &&
    familyShape &&
    !context.isParentProxy &&
    context.activeProfile?.hasFamilyLinks === true;
  const showLegacyModeFamilyHome =
    legacyV0ModeNavActive &&
    legacyV0FamilyCapable &&
    !context.isParentProxy &&
    context.appContext === 'family';
  const showLegacyFlagsOffFamilyHome =
    context.flags.MODE_NAV_V1_ENABLED === false &&
    context.flags.MODE_NAV_V0_ENABLED === false &&
    !context.isParentProxy &&
    (isLegacyGuardian(context.activeProfile, linkedChildIds) ||
      familyHubEligible);
  const showFamilyHome =
    context.flags.MODE_NAV_V1_ENABLED === true
      ? familyShape && !context.isParentProxy
      : showLegacyModeFamilyHome || showLegacyFlagsOffFamilyHome;

  return {
    sessionIsOwner: ownerRole && !context.isParentProxy,
    showFamilyHome,
    showLearningActions: !context.isParentProxy,
    showBilling: ownerRole && !context.isParentProxy,
    showAccountSecurity: ownerRole && !context.isParentProxy,
    showExportDelete: ownerRole && !context.isParentProxy,
    showAddChild: addChildGate,
    showRemoveFamilyMember: removeFamilyMemberGate,
    showFamilyChildActivity: childEditorGate,
    showProgressProfilePicker: childEditorGate,
    showAccommodationChildEditor: moreScreenChildEditorGate,
    showCelebrationsChildEditor: moreScreenChildEditorGate,
    showInlineStudyInvite: ownerRole && familyCapable && !context.isParentProxy,
    showLearnThisToo: learnThisTooGate,
    progressScope: familyShape ? 'children' : 'self',
  };
}

export function resolveHome(
  gates: Pick<NavigationGates, 'showFamilyHome'>,
): NavigationContract['home'] {
  return gates.showFamilyHome
    ? {
        screen: 'FamilyHome',
        titleKey: 'tabs.children',
        iconName: 'Users',
      }
    : {
        screen: 'LearnerHome',
        titleKey: 'tabs.myLearning',
        iconName: 'School',
      };
}

export function resolveCanEnter(
  context: ProfileContext,
  resolution: NavigationShapeResolution,
  gates: NavigationGates,
): NavigationContract['canEnter'] {
  const familyShape = resolution.shape === 'family';
  const linkedChildIds = resolution.linkedChildIds;
  const ownerRole = resolution.ownerRole;
  const visibleTabs = resolution.visibleTabs;

  return (route: RouteKey, params?: RouteParams): boolean => {
    if (V2_ROUTES.has(route)) {
      return context.flags.MODE_NAV_V2_ENABLED === true;
    }

    if (!context.activeProfile) return route === 'home';
    if (context.isParentProxy) {
      return route === 'home' || route === 'library' || route === 'progress';
    }

    if (FAMILY_CHILD_ROUTES.has(route)) {
      // V0 never sets shape='family'. In V0, legacyV0ModeNavActive +
      // effectiveAppContext='family' stands in for familyShape so family-child
      // routes remain accessible in V0 family mode (matching pre-WI-1092 baseline
      // where the outer MODE_NAV_V1_ENABLED guard prevented canEnter from firing).
      const hasFamily =
        familyShape ||
        (resolution.legacyV0ModeNavActive &&
          resolution.effectiveAppContext === 'family');
      return hasFamily && isLinkedChildRoute(params, linkedChildIds);
    }

    if (route === 'topic/relearn') {
      if (params?.for === 'child') {
        // Learn-this-too bridge: source child context is read-only; writes are
        // scoped to the adult family owner in their own learning context.
        return familyShape && ownerRole && !context.isParentProxy;
      }
      return familyShape ? ownerRole : true;
    }

    if (LEARNING_ROUTES.has(route)) {
      return familyShape ? ownerRole : true;
    }

    switch (route) {
      case 'home':
      case 'progress':
        return true;
      case 'progress/saved':
      case 'progress/vocabulary':
        return !familyShape;
      case 'own-learning':
        return visibleTabs.has('own-learning');
      case 'library':
        return !familyShape;
      case 'recaps':
      case 'recaps/[recapId]':
        return familyShape;
      case 'create-profile':
        return params?.for === 'child' ? gates.showAddChild : ownerRole;
      case 'more/account':
      case 'more/privacy':
        return true;
      case 'subscription':
        return gates.showBilling;
    }

    return false;
  };
}

export function resolveIsSurfaced(
  context: ProfileContext,
  resolution: NavigationShapeResolution,
  gates: NavigationGates,
  canEnter: NavigationContract['canEnter'],
): NavigationContract['isSurfaced'] {
  const familyShape = resolution.shape === 'family';
  const linkedChildIds = resolution.linkedChildIds;
  const ownerRole = resolution.ownerRole;
  const visibleTabs = resolution.visibleTabs;

  return (route: RouteKey, params?: RouteParams): boolean => {
    if (!canEnter(route, params)) return false;

    if (V2_ROUTES.has(route)) {
      return context.flags.MODE_NAV_V2_ENABLED === true;
    }

    if (LEARNING_ROUTES.has(route)) {
      return !familyShape && !context.isParentProxy;
    }

    if (FAMILY_CHILD_ROUTES.has(route)) {
      // Mirror the canEnter V0 escape hatch — familyShape is always false in V0.
      const hasFamily =
        familyShape ||
        (resolution.legacyV0ModeNavActive &&
          resolution.effectiveAppContext === 'family');
      return hasFamily && isLinkedChildRoute(params, linkedChildIds);
    }

    switch (route) {
      case 'home':
      case 'progress':
        return true;
      case 'progress/saved':
      case 'progress/vocabulary':
        return !familyShape;
      case 'own-learning':
      case 'library':
      case 'recaps':
        return visibleTabs.has(route);
      case 'recaps/[recapId]':
        return familyShape;
      case 'create-profile':
        return params?.for === 'child' ? gates.showAddChild : ownerRole;
      case 'more/account':
      case 'more/privacy':
        return true;
      case 'subscription':
        return gates.showBilling;
    }

    return false;
  };
}

export function resolveChrome(
  context: ProfileContext,
  resolution: NavigationShapeResolution,
): NavigationContract['chrome'] {
  const showModeSwitcher =
    !context.isParentProxy &&
    ((context.flags.MODE_NAV_V1_ENABLED && resolution.familyCapable) ||
      (resolution.legacyV0ModeNavActive && resolution.legacyV0FamilyCapable));

  return {
    modeSwitcher: showModeSwitcher ? 'global-header' : 'hidden',
    proxyBanner:
      context.isParentProxy && context.activeProfile ? 'required' : 'hidden',
  };
}

export function resolveNavigationContract(
  context: ProfileContext,
): NavigationContract {
  const shapeResolution = resolveShape(context);
  const gates = resolveGates(context, shapeResolution);
  const home = resolveHome(gates);
  const chrome = resolveChrome(context, shapeResolution);
  const canEnter = resolveCanEnter(context, shapeResolution, gates);
  const isSurfaced = resolveIsSurfaced(
    context,
    shapeResolution,
    gates,
    canEnter,
  );

  return {
    shape: shapeResolution.shape,
    effectiveAppContext: shapeResolution.effectiveAppContext,
    isFamilyCapable: shapeResolution.familyCapable,
    isParentProxy: context.isParentProxy,
    visibleTabs: shapeResolution.visibleTabs,
    home,
    chrome,
    gates,
    canEnter,
    isSurfaced,
    queryScope: {
      appContext: shapeResolution.effectiveAppContext,
      profileId: context.activeProfile?.id ?? null,
    },
    diagnostic: {
      activeProfileId: context.activeProfile?.id ?? null,
      effectiveAppContext: shapeResolution.effectiveAppContext,
      isFamilyCapable: shapeResolution.familyCapable,
      isParentProxy: context.isParentProxy,
      linkedChildIds: shapeResolution.linkedChildIds,
      reason: shapeResolution.reason,
      role: context.role,
      shape: shapeResolution.shape,
    },
  };
}
