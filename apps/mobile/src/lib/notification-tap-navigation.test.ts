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
      title: 'Open learning update?',
      message:
        'You are in a session. Finish this first, or open the update and leave the current flow.',
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
});
