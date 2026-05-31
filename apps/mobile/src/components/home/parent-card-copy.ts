import type { DashboardChild, RecapListItem } from '@eduagent/schemas';

import type { Translate } from '../../i18n';
import { buildSingleChildPrompts, firstNameOf } from './parent-card-prompts';

// Pure state→copy resolver for the parent home child card. No hooks, no JSX —
// just DashboardChild + the child's latest recap → the strings/chips the card
// renders. Mentor-voice, positive-only: no card string may say "weak",
// "forgotten", "struggling", "behind", "declining", or "needs attention" in any
// state (enforced by the negative-framing guard in parent-card-copy.test.ts).

export interface MomentumChip {
  icon: string;
  label: string;
}

export interface ParentCardCopy {
  isActive: boolean;
  statusWord: string;
  headline: string;
  momentum: MomentumChip[];
  solid: string | null;
  comingUp: string | null;
  starter: string | null;
}

const RECENT_RECAP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MOMENTUM_CHIPS = 3;

/** A recap counts as "recent" if it started within the last 7 days. */
function recapIsRecent(recap: RecapListItem | null, now: Date): boolean {
  if (!recap) return false;
  const started = new Date(recap.startedAt as unknown as string).getTime();
  if (Number.isNaN(started)) return false;
  return now.getTime() - started <= RECENT_RECAP_WINDOW_MS;
}

function focusOf(child: DashboardChild): string | undefined {
  return child.currentlyWorkingOn[0] ?? child.subjects[0]?.name;
}

/** Restart/no-activity starter from the shared prompt builder (one prompt). */
function fallbackStarter(child: DashboardChild, t: Translate): string | null {
  const prompts = buildSingleChildPrompts(
    { id: child.profileId, displayName: child.displayName },
    child,
    t,
    false,
    1,
  );
  return prompts[0]?.text ?? null;
}

function resolveQuiet(
  child: DashboardChild,
  t: Translate,
  name: string,
  focus: string | undefined,
): ParentCardCopy {
  const isNewLearner = child.totalSessions === 0;
  const subjectNames = child.subjects.map((subject) => subject.name);

  const statusWord = isNewLearner
    ? t('home.parent.card.statusJustStarting')
    : t('home.parent.card.statusQuietWeek');

  let headline: string;
  if (isNewLearner && subjectNames.length > 0) {
    headline = t('home.parent.card.quietNew', {
      name,
      subjects: subjectNames.join(', '),
    });
  } else if (focus) {
    headline = t('home.parent.card.quietWithFocus', { name, focus });
  } else {
    headline = t('home.parent.card.quietPlain', { name });
  }

  return {
    isActive: false,
    statusWord,
    headline,
    momentum: [],
    solid: null,
    comingUp: null,
    starter:
      !isNewLearner && focus
        ? t('home.parent.card.quietStarterWithFocus', { name, focus })
        : fallbackStarter(child, t),
  };
}

function resolveActive(
  child: DashboardChild,
  latestRecap: RecapListItem | null,
  t: Translate,
  name: string,
  focus: string | undefined,
): ParentCardCopy {
  const statusWord =
    child.currentStreak >= 2
      ? t('home.parent.card.statusStreak', { count: child.currentStreak })
      : t('home.parent.card.statusActive');

  // Headline: prefer the recap's evidence-bound highlight, then a FORMATTED
  // weeklyHeadline (an object { label, value, comparison } — never a string),
  // then a templated focus line.
  let headline: string;
  if (latestRecap?.highlight) {
    headline = latestRecap.highlight;
  } else if (child.weeklyHeadline) {
    headline = t('home.parent.card.headlineFromWeekly', {
      label: child.weeklyHeadline.label,
      value: child.weeklyHeadline.value,
      comparison: child.weeklyHeadline.comparison,
    });
  } else if (focus) {
    headline = t('home.parent.card.activePlain', { name, focus });
  } else {
    headline = t('home.parent.card.activePlainNoFocus', { name });
  }

  // Momentum: positive values only. `progress` is nullable/optional — treat a
  // missing progress as all-zero so the strip simply hides.
  const momentum: MomentumChip[] = [];
  if (child.currentStreak >= 2) {
    momentum.push({
      icon: '🔥',
      label: t('home.parent.card.momentumStreak', {
        count: child.currentStreak,
      }),
    });
  }
  const topicsDelta = child.progress?.weeklyDeltaTopicsMastered ?? 0;
  if (topicsDelta > 0) {
    momentum.push({
      icon: '✦',
      label: t('home.parent.card.momentumTopics', { count: topicsDelta }),
    });
  }
  const wordsDelta = child.progress?.weeklyDeltaVocabularyTotal ?? 0;
  if (wordsDelta > 0) {
    momentum.push({
      icon: '📖',
      label: t('home.parent.card.momentumWords', { count: wordsDelta }),
    });
  }

  const strongSubjects = child.subjects
    .filter((subject) => subject.retentionStatus === 'strong')
    .map((subject) => subject.name);
  const solid =
    strongSubjects.length > 0
      ? t('home.parent.card.solid', { subjects: strongSubjects.join(', ') })
      : null;

  const comingUp = latestRecap?.nextTopicTitle
    ? t('home.parent.card.comingUp', { topic: latestRecap.nextTopicTitle })
    : null;

  const starter = latestRecap?.conversationPrompt ?? fallbackStarter(child, t);

  return {
    isActive: true,
    statusWord,
    headline,
    momentum: momentum.slice(0, MAX_MOMENTUM_CHIPS),
    solid,
    comingUp,
    starter,
  };
}

/**
 * Resolves the parent home child card to its quiet/active state copy.
 * `isActive` = the child has a session this week OR a recap from the last 7 days.
 */
export function resolveParentCardCopy(
  child: DashboardChild,
  latestRecap: RecapListItem | null,
  t: Translate,
  now: Date = new Date(),
): ParentCardCopy {
  const name = firstNameOf(child.displayName);
  const focus = focusOf(child);
  const isActive =
    child.sessionsThisWeek > 0 || recapIsRecent(latestRecap, now);

  return isActive
    ? resolveActive(child, latestRecap, t, name, focus)
    : resolveQuiet(child, t, name, focus);
}

/**
 * Household pulse line shown as the greeting subtitle. Returns null when there
 * are no children so the caller can fall back to the generic greeting subtitle.
 * A child counts as active this week when `sessionsThisWeek > 0`.
 */
export function resolveHouseholdPulse(
  children: DashboardChild[],
  t: Translate,
): string | null {
  if (children.length === 0) return null;

  const activeCount = children.filter(
    (child) => child.sessionsThisWeek > 0,
  ).length;

  const [firstChild] = children;
  if (children.length === 1 && firstChild) {
    const name = firstNameOf(firstChild.displayName);
    return activeCount === 1
      ? t('home.parent.pulse.oneActive', { name })
      : t('home.parent.pulse.oneQuiet', { name });
  }

  if (activeCount === 0) {
    return t('home.parent.pulse.multiNoneActive', { count: children.length });
  }
  if (activeCount === children.length) {
    return t('home.parent.pulse.multiAllActive', { count: children.length });
  }
  return t('home.parent.pulse.multiSomeActive', {
    count: children.length,
    activeCount,
  });
}
