import { decideNotificationTapNavigation } from './notification-tap-navigation';

describe('decideNotificationTapNavigation', () => {
  it('pushes same-context notifications while idle', () => {
    expect(
      decideNotificationTapNavigation({
        currentPathname: '/home',
        effectiveAppContext: 'study',
        notificationData: { type: 'nudge' },
      }),
    ).toEqual({ context: 'study', kind: 'push', href: '/(app)/home' });
  });

  it('pushes same-context notifications during a session', () => {
    expect(
      decideNotificationTapNavigation({
        currentPathname: '/session',
        effectiveAppContext: 'study',
        notificationData: { type: 'review_reminder' },
      }),
    ).toEqual({ context: 'study', kind: 'push', href: '/(app)/home' });
  });

  it('replaces into the target context when idle', () => {
    expect(
      decideNotificationTapNavigation({
        currentPathname: '/home',
        effectiveAppContext: 'study',
        notificationData: { type: 'weekly_progress' },
      }),
    ).toEqual({
      context: 'family',
      kind: 'replace',
      href: '/(app)/recaps',
    });
  });

  it('prompts before crossing context during an active session', () => {
    expect(
      decideNotificationTapNavigation({
        currentPathname: '/session',
        effectiveAppContext: 'study',
        notificationData: { type: 'weekly_progress' },
      }),
    ).toEqual({
      context: 'family',
      kind: 'prompt',
      href: '/(app)/recaps',
      titleKey: 'notifications.tap.crossContextPromptTitle',
      messageKey: 'notifications.tap.crossContextPromptMessage',
    });
  });

  it('does not treat non-session segments containing "session" as active session', () => {
    expect(
      decideNotificationTapNavigation({
        currentPathname: '/session-history',
        effectiveAppContext: 'study',
        notificationData: { type: 'weekly_progress' },
      }),
    ).toEqual({
      context: 'family',
      kind: 'replace',
      href: '/(app)/recaps',
    });
  });

  it('treats nested session routes as active', () => {
    expect(
      decideNotificationTapNavigation({
        currentPathname: '/(app)/session/abc-123',
        effectiveAppContext: 'study',
        notificationData: { type: 'weekly_progress' },
      }),
    ).toEqual({
      context: 'family',
      kind: 'prompt',
      href: '/(app)/recaps',
      titleKey: 'notifications.tap.crossContextPromptTitle',
      messageKey: 'notifications.tap.crossContextPromptMessage',
    });
  });

  it('ignores notification payloads without a route target', () => {
    expect(
      decideNotificationTapNavigation({
        currentPathname: '/home',
        effectiveAppContext: 'study',
        notificationData: { type: 'unknown' },
      }),
    ).toEqual({ kind: 'ignore' });
  });

  it('routes payment failures through the canonical payer landing screen', () => {
    expect(
      decideNotificationTapNavigation({
        currentPathname: '/home',
        effectiveAppContext: 'study',
        notificationData: {
          type: 'payment_failed',
          payerPersonId: '00000000-0000-7000-a000-000000000001',
        },
      }),
    ).toEqual({
      context: 'study',
      kind: 'push',
      href: {
        pathname: '/(app)/billing/manage',
        params: {
          payerPersonId: '00000000-0000-7000-a000-000000000001',
        },
      },
    });
  });
});
