import type { AppMode } from './app-context';
import type { NavigationContract } from './navigation-contract';

const GUARDIAN_TABS: ReadonlySet<string> = new Set([
  'home',
  'own-learning',
  'library',
  'progress',
  'more',
]);

const LEARNER_TABS: ReadonlySet<string> = new Set([
  'home',
  'library',
  'progress',
  'more',
]);

const PARENT_PROXY_TABS: ReadonlySet<string> = new Set([
  'home',
  'library',
  'progress',
]);

const FAMILY_MODE_TABS: ReadonlySet<string> = new Set([
  'home',
  'progress',
  'more',
]);

const STUDY_MODE_TABS: ReadonlySet<string> = new Set([
  'home',
  'library',
  'progress',
  'more',
]);

export type LegacyTabShape = 'guardian' | 'learner';

export type ShellHomeTabPresentation = {
  titleKey:
    | 'tabs.mentor'
    | 'tabs.children'
    | 'tabs.familyHub'
    | 'tabs.home'
    | 'tabs.myLearning';
  accessibilityLabelKey:
    | 'tabs.mentorLabel'
    | 'tabs.childrenLabel'
    | 'tabs.familyHubLabel'
    | 'tabs.homeLabel'
    | 'tabs.myLearningLabel';
  iconName: 'Home' | 'School' | 'Users';
};

function isLegacyGuardianProfile(
  profile: { isOwner: boolean } | null | undefined,
  allProfiles: ReadonlyArray<{ isOwner: boolean }>,
): boolean {
  if (!profile?.isOwner) return false;
  return allProfiles.some((p) => !p.isOwner);
}

export function resolveTabShape({
  activeProfile,
  profiles,
  isParentProxy,
}: {
  activeProfile: { isOwner: boolean } | null | undefined;
  profiles: ReadonlyArray<{ isOwner: boolean }>;
  isParentProxy: boolean;
}): LegacyTabShape {
  // [CCR PR #215 / Bug 305] Default to 'learner' (4-tab least-privilege)
  // when the profile is unknown or not yet loaded.
  if (!activeProfile) return 'learner';
  if (isParentProxy) return 'learner';
  if (isLegacyGuardianProfile(activeProfile, profiles)) return 'guardian';
  return 'learner';
}

export function computeVisibleTabs(
  shape: LegacyTabShape = 'guardian',
  isParentProxy = false,
): Set<string> {
  if (isParentProxy) return new Set(PARENT_PROXY_TABS);

  switch (shape) {
    case 'guardian':
      return new Set(GUARDIAN_TABS);
    case 'learner':
      return new Set(LEARNER_TABS);
  }
}

export function computeModeVisibleTabs(mode: AppMode | null): Set<string> {
  if (mode === 'family') return new Set(FAMILY_MODE_TABS);
  if (mode === 'study') return new Set(STUDY_MODE_TABS);
  return new Set();
}

export function resolveHomeTabPresentation(
  shape: LegacyTabShape,
  isParentProxy = false,
  mode: AppMode | null = null,
): ShellHomeTabPresentation {
  if (!isParentProxy && mode === 'family') {
    return {
      titleKey: 'tabs.familyHub',
      accessibilityLabelKey: 'tabs.familyHubLabel',
      iconName: 'Home',
    };
  }

  // Guardian shape with no app-mode set (or no family capability) shows both
  // `home` and `own-learning` tabs (see GUARDIAN_TABS). Labelling both as
  // "My Learning" produces side-by-side duplicate tab titles, so the home
  // tab uses the generic "Home" label in that case. The proxy/learner/study
  // paths never expose own-learning alongside home, so "My Learning" on the
  // home tab remains correct there.
  if (!isParentProxy && shape === 'guardian' && mode == null) {
    return {
      titleKey: 'tabs.home',
      accessibilityLabelKey: 'tabs.homeLabel',
      iconName: 'Home',
    };
  }

  return {
    titleKey: 'tabs.myLearning',
    accessibilityLabelKey: 'tabs.myLearningLabel',
    iconName: 'School',
  };
}

export function resolveContractHomeTabPresentation(
  home: NavigationContract['home'],
): ShellHomeTabPresentation {
  if (home.screen === 'FamilyHome') {
    return {
      titleKey: 'tabs.children',
      accessibilityLabelKey: 'tabs.childrenLabel',
      iconName: home.iconName,
    };
  }

  return {
    titleKey: 'tabs.myLearning',
    accessibilityLabelKey: 'tabs.myLearningLabel',
    iconName: home.iconName,
  };
}

export function resolveShellVisibleTabs({
  familyCapable,
  isParentProxy,
  mode,
  navigationContract,
  tabShape,
  useContract,
}: {
  familyCapable: boolean;
  isParentProxy: boolean;
  mode: AppMode | null;
  navigationContract: Pick<NavigationContract, 'visibleTabs'>;
  tabShape: LegacyTabShape;
  useContract: boolean;
}): Set<string> {
  if (useContract) return new Set(navigationContract.visibleTabs);
  if (isParentProxy) return computeVisibleTabs(tabShape, true);
  if (familyCapable) {
    // V0 family-capable owner. Once `mode` resolves this returns the mode tab
    // set (Family = 3 tabs, Study = 4 tabs). During the load window `mode` is
    // null; falling through to `computeVisibleTabs('guardian')` here would
    // render the transient 5-tab GUARDIAN_TABS shell and then snap to the 3-tab
    // Family shell once `mode` arrives. That 5->3 snap drops `library` /
    // `own-learning` — if the user had tapped one of those transient tabs the
    // active tab disappears and the navigator falls back to Home. A V0
    // family-capable owner resolves to Family mode on a fresh load (see
    // app-context `derivedMode`: `familyCapable ? 'family' : 'study'`, with no
    // override before user interaction), so hold the Family mode shell during
    // load to stabilize the tab set and eliminate the flicker.
    return computeModeVisibleTabs(mode ?? 'family');
  }
  return computeVisibleTabs(tabShape, false);
}
