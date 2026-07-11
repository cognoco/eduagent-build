import type { Href } from 'expo-router';

import type { TranslateKey } from '../i18n';
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
      messageKey: TranslateKey;
      titleKey: TranslateKey;
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
    case 'payment_failed':
      if (typeof data.payerPersonId !== 'string') return null;
      return {
        context: 'study',
        href: {
          pathname: '/(app)/billing/manage',
          params: { payerPersonId: data.payerPersonId },
        } as Href,
      };
    default:
      return null;
  }
}

function isActiveSessionPath(pathname: string): boolean {
  return /(^|\/)session(\/|$)/.test(pathname);
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
      titleKey: 'notifications.tap.crossContextPromptTitle',
      messageKey: 'notifications.tap.crossContextPromptMessage',
    };
  }

  if (crossesContext) {
    return { context: target.context, kind: 'replace', href: target.href };
  }

  return { context: target.context, kind: 'push', href: target.href };
}
