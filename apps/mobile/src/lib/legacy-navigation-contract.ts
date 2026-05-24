import type { NavigationContract } from './navigation-contract';
import type { AppMode } from './app-context';

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
): {
  titleKey: 'tabs.familyHub' | 'tabs.myLearning';
  accessibilityLabelKey: 'tabs.familyHubLabel' | 'tabs.myLearningLabel';
  iconName: 'Home' | 'School';
} {
  if (!isParentProxy && mode === 'family') {
    return {
      titleKey: 'tabs.familyHub',
      accessibilityLabelKey: 'tabs.familyHubLabel',
      iconName: 'Home',
    };
  }

  return {
    titleKey: 'tabs.myLearning',
    accessibilityLabelKey: 'tabs.myLearningLabel',
    iconName: 'School',
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
  if (familyCapable && mode !== null) return computeModeVisibleTabs(mode);
  return computeVisibleTabs(tabShape, false);
}
