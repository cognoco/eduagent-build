import type { Href } from 'expo-router';

import type { NavigationAppContext } from './navigation-contract';

type NotificationData = Record<string, unknown>;

interface NotificationTarget {
  context: NavigationAppContext;
  href: Href;
}

export type NotificationTapDecision =
  | { kind: 'ignore' }
  | {
      context: NavigationAppContext;
      kind: 'prompt';
      href: Href;
      message: string;
      title: string;
    }
  | { context: NavigationAppContext; kind: 'push'; href: Href }
  | { context: NavigationAppContext; kind: 'replace'; href: Href };

function notificationTargetForData(
  data: NotificationData | undefined,
): NotificationTarget | null {
  if (typeof data?.type !== 'string') return null;

  switch (data.type) {
    case 'nudge':
    case 'review_reminder':
    case 'daily_reminder':
    case 'recall_nudge':
    case 'dictation_review':
    case 'session_filing_failed':
      return { context: 'study', href: '/(app)/home' as Href };
    case 'progress_refresh':
      return { context: 'family', href: '/(app)/progress' as Href };
    case 'weekly_progress':
    case 'monthly_report':
    case 'struggle_noticed':
    case 'struggle_flagged':
    case 'struggle_resolved':
      return { context: 'family', href: '/(app)/recaps' as Href };
    case 'subscribe_request':
    case 'trial_expiry':
      return { context: 'study', href: '/(app)/subscription' as Href };
    default:
      return null;
  }
}

function isActiveSessionPath(pathname: string): boolean {
  return pathname === '/session' || pathname.includes('/session');
}

export function decideNotificationTapNavigation({
  currentPathname,
  effectiveAppContext,
  notificationData,
}: {
  currentPathname: string;
  effectiveAppContext: NavigationAppContext;
  notificationData: NotificationData | undefined;
}): NotificationTapDecision {
  const target = notificationTargetForData(notificationData);
  if (!target) return { kind: 'ignore' };

  const crossesContext = target.context !== effectiveAppContext;
  if (isActiveSessionPath(currentPathname) && crossesContext) {
    return {
      context: target.context,
      kind: 'prompt',
      href: target.href,
      title: 'Open learning update?',
      message:
        'You are in a session. Finish this first, or open the update and leave the current flow.',
    };
  }

  if (crossesContext) {
    return { context: target.context, kind: 'replace', href: target.href };
  }

  return { context: target.context, kind: 'push', href: target.href };
}
