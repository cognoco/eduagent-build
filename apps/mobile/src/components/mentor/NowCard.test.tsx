import { render, fireEvent, act } from '@testing-library/react-native';
import i18next from 'i18next';
import type { NowCard as NowCardData } from '@eduagent/schemas';

import deCatalog from '../../i18n/locales/de.json';
import jaCatalog from '../../i18n/locales/ja.json';
import { NowCard } from './NowCard';

function card(overrides: Partial<NowCardData> = {}): NowCardData {
  return {
    kind: 'unfinished_session',
    templateKey: 'now.unfinished_session.default',
    params: { topicTitle: 'Fractions' },
    deepLink: {
      route: 'session.resume',
      params: { sessionId: 'session-1' },
      chain: [],
    },
    scope: 'self',
    ...overrides,
  };
}

describe('NowCard', () => {
  it('[WI-2113 AC-2] labels spaced-retrieval work Review rather than Challenge', () => {
    const { getByTestId, getByText, queryByText } = render(
      <NowCard
        card={card({
          kind: 'retention_due',
          templateKey: 'now.retention_due.default',
        })}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
      />,
    );

    expect(getByTestId('now-card-retention_due')).toBeTruthy();
    expect(getByText('Review')).toBeTruthy();
    expect(queryByText('Challenge')).toBeNull();
  });

  it('renders the mapped title for a known server template', () => {
    const { getByTestId, getByText } = render(
      <NowCard card={card()} onContinue={jest.fn()} onDecline={jest.fn()} />,
    );

    expect(getByTestId('now-card-unfinished_session')).toBeTruthy();
    expect(getByText('Continue your last session')).toBeTruthy();
  });

  it('falls back to the generic card copy for an unknown server template', () => {
    const { getByText } = render(
      <NowCard
        card={card({ templateKey: 'now.future_kind.default' })}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
      />,
    );

    expect(getByText('Open your next learning step')).toBeTruthy();
  });

  it('renders the mentor notice actions with translated quiet copy', () => {
    const notice = card({
      kind: 'mentor_notice',
      templateKey: 'now.mentor_notice.default',
      params: { concept: 'changing signs', subjectName: 'Algebra' },
      deepLink: {
        route: 'notice.recheck',
        params: { noticeId: 'notice-1', subjectId: 'subject-1' },
        chain: [],
      },
    });
    const onDecline = jest.fn();
    const rendered = render(
      <NowCard card={notice} onContinue={jest.fn()} onDecline={onDecline} />,
    );

    expect(rendered.getByText('A small idea worth checking')).toBeTruthy();
    expect(rendered.getByText('Check it now')).toBeTruthy();
    fireEvent.press(rendered.getByText('Not now'));
    expect(onDecline).toHaveBeenCalledWith(notice);
  });

  // [WI-2499 AC-1] A mentor-notice card must expose Continue and Not now
  // only — no generic Complete/mastery affordance, even when the caller
  // (NowCardStack) passes onCompleted for the anchor/module slot generically.
  it('[WI-2499 AC-1] never renders the generic Complete action for a mentor notice, even when onCompleted is supplied', () => {
    const notice = card({
      kind: 'mentor_notice',
      templateKey: 'now.mentor_notice.default',
      params: { concept: 'changing signs', subjectName: 'Algebra' },
      deepLink: {
        route: 'notice.recheck',
        params: { noticeId: 'notice-1', subjectId: 'subject-1' },
        chain: [],
      },
    });
    const rendered = render(
      <NowCard
        card={notice}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onCompleted={jest.fn()}
      />,
    );

    expect(rendered.queryByTestId('now-card-complete')).toBeNull();
    expect(rendered.queryByText('Done')).toBeNull();
  });

  it('fires continue, decline, and completion callbacks with the card', () => {
    const value = card({ kind: 'retention_due' });
    const onContinue = jest.fn();
    const onDecline = jest.fn();
    const onCompleted = jest.fn();
    const { getByTestId } = render(
      <NowCard
        card={value}
        variant="anchor"
        arcState="due"
        onContinue={onContinue}
        onDecline={onDecline}
        onCompleted={onCompleted}
      />,
    );

    fireEvent.press(getByTestId('now-card-continue'));
    expect(onContinue).toHaveBeenCalledWith(value);

    fireEvent.press(getByTestId('now-card-complete'));
    expect(onCompleted).toHaveBeenCalledWith(value);

    fireEvent.press(getByTestId('now-card-dismiss'));
    expect(onDecline).toHaveBeenCalledWith(value);
  });

  it('renders with a stagger delay and stays interactive under reduced motion', () => {
    const reanimated = require('react-native-reanimated');
    const spy = jest
      .spyOn(reanimated, 'useReducedMotion')
      .mockReturnValue(true);
    try {
      const onContinue = jest.fn();
      const value = card();
      const { getByTestId } = render(
        <NowCard
          card={value}
          enterDelayMs={50}
          onContinue={onContinue}
          onDecline={jest.fn()}
        />,
      );

      expect(getByTestId('now-card-unfinished_session')).toBeTruthy();
      fireEvent.press(getByTestId('now-card-continue'));
      expect(onContinue).toHaveBeenCalledWith(value);
    } finally {
      spy.mockRestore();
    }
  });

  it('renders arc state only when explicitly supplied', () => {
    const { queryByTestId } = render(
      <NowCard card={card()} onContinue={jest.fn()} onDecline={jest.fn()} />,
    );
    expect(queryByTestId('now-card-arc')).toBeNull();

    const rendered = render(
      <NowCard
        card={card({ kind: 'retention_due' })}
        arcState="advancing"
        onContinue={jest.fn()}
        onDecline={jest.fn()}
      />,
    );
    expect(rendered.getByTestId('now-card-arc').props.children).toBe(
      'Getting stronger',
    );
  });

  it('formats billing deadlines with the active app locale instead of the device locale', async () => {
    const originalLanguage = i18next.language;
    const deviceLocale = new Intl.DateTimeFormat().resolvedOptions().locale;
    const appLanguage = deviceLocale.startsWith('de') ? 'ja' : 'de';
    const appCatalog = appLanguage === 'de' ? deCatalog : jaCatalog;
    const hadAppCatalog = i18next.hasResourceBundle(appLanguage, 'translation');
    const deadline = new Date('2026-08-01T00:00:00.000Z');
    const expectedDeadline = new Intl.DateTimeFormat(appLanguage, {
      dateStyle: 'medium',
    }).format(deadline);
    const expectedDeadlinePattern = new RegExp(
      expectedDeadline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    const dateTimeFormatSpy = jest.spyOn(Intl, 'DateTimeFormat');
    let unmount: (() => void) | undefined;

    try {
      i18next.addResourceBundle(
        appLanguage,
        'translation',
        appCatalog,
        false,
        true,
      );
      await act(async () => {
        await i18next.changeLanguage(appLanguage);
      });
      dateTimeFormatSpy.mockClear();

      const rendered = render(
        <NowCard
          card={card({
            kind: 'billing_alert',
            templateKey: 'now.billing_alert.payment_failed',
            params: {
              planTier: 'plus',
              accessState: 'current',
              deadlineAt: deadline.toISOString(),
            },
            deepLink: {
              route: 'billing.manage',
              params: {},
              chain: ['settings.more', 'settings.account'],
            },
          })}
          onContinue={jest.fn()}
          onDecline={jest.fn()}
        />,
      );
      unmount = rendered.unmount;

      expect(dateTimeFormatSpy).toHaveBeenCalledWith(appLanguage, {
        dateStyle: 'medium',
      });
      expect(rendered.getByText(expectedDeadlinePattern)).toBeTruthy();
    } finally {
      unmount?.();
      dateTimeFormatSpy.mockRestore();
      await act(async () => {
        await i18next.changeLanguage(originalLanguage);
      });
      if (!hadAppCatalog) {
        i18next.removeResourceBundle(appLanguage, 'translation');
      }
    }
  });

  it('keeps current-access copy when the billing deadline is invalid', () => {
    const rendered = render(
      <NowCard
        card={card({
          kind: 'billing_alert',
          templateKey: 'now.billing_alert.payment_failed',
          params: {
            planTier: 'plus',
            accessState: 'current',
            deadlineAt: 'not-a-date',
          },
          deepLink: {
            route: 'billing.manage',
            params: {},
            chain: ['settings.more', 'settings.account'],
          },
        })}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
      />,
    );

    expect(
      rendered.getByText('Your paid access is still active.'),
    ).toBeTruthy();
    expect(
      rendered.queryByText(
        'Your account is using free access now. Update payment to restore your plan.',
      ),
    ).toBeNull();
  });
});
