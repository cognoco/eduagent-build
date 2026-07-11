import { render, fireEvent } from '@testing-library/react-native';
import type { NowCard as NowCardData, NowResponse } from '@eduagent/schemas';

import { NowCardStack, getNowCardDismissKey } from './NowCardStack';

function card(
  kind: NowCardData['kind'],
  id: string,
  overrides: Partial<NowCardData> = {},
): NowCardData {
  return {
    kind,
    templateKey: `now.${kind}.default`,
    params: { topicTitle: id },
    deepLink: {
      route: 'subject.topic',
      params: { subjectId: 'subject-1', bookId: 'book-1', topicId: id },
      chain: ['subject.hub'],
    },
    scope: 'self',
    ...overrides,
  };
}

function feed(
  cards: NowCardData[],
  overrides: Partial<NowResponse> = {},
): NowResponse {
  return {
    scope: 'self',
    cards,
    overflowCount: 0,
    generatedAt: '2026-06-14T08:00:00.000Z',
    ...overrides,
  };
}

describe('NowCardStack', () => {
  it('renders one anchor and up to two module cards', () => {
    const { getByTestId, queryByTestId } = render(
      <NowCardStack
        feed={feed([
          card('unfinished_session', 'topic-1'),
          card('retention_due', 'topic-2'),
          card('needs_deepening', 'topic-3'),
        ])}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(getByTestId('now-card-slot-anchor')).toBeTruthy();
    expect(getByTestId('now-card-slot-module-0')).toBeTruthy();
    expect(getByTestId('now-card-slot-module-1')).toBeTruthy();
    expect(queryByTestId('now-overflow-entry')).toBeNull();
  });

  it('puts entry and exit animations on the keyed card slots', () => {
    const { getByTestId } = render(
      <NowCardStack
        feed={feed([
          card('unfinished_session', 'topic-1'),
          card('retention_due', 'topic-2'),
        ])}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(getByTestId('now-card-slot-anchor').props.entering).toBeTruthy();
    expect(getByTestId('now-card-slot-anchor').props.exiting).toBeTruthy();
    expect(getByTestId('now-card-slot-anchor').props.collapsable).toBe(false);
    expect(getByTestId('now-card-slot-module-0').props.entering).toBeTruthy();
    expect(getByTestId('now-card-slot-module-0').props.exiting).toBeTruthy();
    expect(getByTestId('now-card-slot-module-0').props.collapsable).toBe(false);
  });

  it('renders overflow count and calls the overflow handler', () => {
    const onShowOverflow = jest.fn();
    const { getByTestId, getByText } = render(
      <NowCardStack
        feed={feed([card('unfinished_session', 'topic-1')], {
          overflowCount: 5,
        })}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={onShowOverflow}
      />,
    );

    expect(getByText('5 more options')).toBeTruthy();
    fireEvent.press(getByTestId('now-overflow-entry'));
    expect(onShowOverflow).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for an empty feed with no overflow (no dead-end card)', () => {
    const { queryByTestId, toJSON } = render(
      <NowCardStack
        feed={feed([])}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    // The old "Nothing needs you / Browse" card was a dead-end (its tap called
    // onShowOverflow with overflowCount === 0). The screen's always-present Ask
    // box + light-practice affordance now own the empty state instead.
    expect(queryByTestId('now-empty-card')).toBeNull();
    expect(queryByTestId('now-card-stack')).toBeNull();
    expect(toJSON()).toBeNull();
  });

  it('still renders the overflow entry for an empty feed that has overflow', () => {
    const onShowOverflow = jest.fn();
    const { getByTestId } = render(
      <NowCardStack
        feed={feed([], { overflowCount: 3 })}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={onShowOverflow}
      />,
    );

    fireEvent.press(getByTestId('now-overflow-entry'));
    expect(onShowOverflow).toHaveBeenCalledTimes(1);
  });

  it('filters locally dismissed cards and drops malformed non-action cards', () => {
    const dismissed = card('retention_due', 'topic-2');
    const malformed = {
      ...card('parked_item', 'topic-3'),
      deepLink: undefined,
    } as unknown as NowCardData;
    const { queryByTestId } = render(
      <NowCardStack
        feed={feed([
          card('unfinished_session', 'topic-1'),
          dismissed,
          malformed,
        ])}
        dismissedKeys={new Set([getNowCardDismissKey(dismissed)])}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(queryByTestId('now-card-retention_due')).toBeNull();
    expect(queryByTestId('now-card-parked_item')).toBeNull();
  });

  it('keeps an active billing alert visible even when its key is locally dismissed', () => {
    const billing = card('billing_alert', 'billing-1', {
      templateKey: 'now.billing_alert.payment_failed',
      params: {
        planTier: 'plus',
        accessState: 'free_fallback',
        deadlineAt: null,
      },
      deepLink: {
        route: 'billing.manage',
        params: {},
        chain: ['settings.more', 'settings.account'],
      },
    });
    const { getByTestId, queryByTestId } = render(
      <NowCardStack
        feed={feed([billing])}
        dismissedKeys={new Set([getNowCardDismissKey(billing)])}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(getByTestId('now-card-billing_alert')).toBeTruthy();
    expect(queryByTestId('now-card-dismiss')).toBeNull();
  });

  it('states the billing deadline and whether paid access is still current', () => {
    const billing = card('billing_alert', 'billing-current', {
      templateKey: 'now.billing_alert.payment_failed',
      params: {
        planTier: 'plus',
        accessState: 'current',
        deadlineAt: '2026-08-01T00:00:00.000Z',
      },
      deepLink: {
        route: 'billing.manage',
        params: {},
        chain: ['settings.more', 'settings.account'],
      },
    });
    const { getByText } = render(
      <NowCardStack
        feed={feed([billing])}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(getByText(/paid access stays active until/i)).toBeTruthy();
  });

  it('states when the subscription has already fallen back to free access', () => {
    const billing = card('billing_alert', 'billing-fallback', {
      templateKey: 'now.billing_alert.payment_failed',
      params: {
        planTier: 'plus',
        accessState: 'free_fallback',
        deadlineAt: null,
      },
      deepLink: {
        route: 'billing.manage',
        params: {},
        chain: ['settings.more', 'settings.account'],
      },
    });
    const { getByText } = render(
      <NowCardStack
        feed={feed([billing])}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(getByText(/using free access now/i)).toBeTruthy();
  });

  it('always renders synthesized quota affordances as modules', () => {
    const quota = card('ledger_moment', 'quota', {
      templateKey: 'now.ledger_moment.quota',
      params: { ledgerKind: 'quota' },
    });
    const { getByTestId } = render(
      <NowCardStack
        feed={feed([card('unfinished_session', 'topic-1'), quota])}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(getByTestId('now-card-slot-module-0')).toBeTruthy();
    expect(getByTestId('now-ledger-moment')).toBeTruthy();
  });

  it('[WI-1020] outer stack has list role, slot Views have listitem role, empty-state Pressable does not', () => {
    // Non-empty feed: renders the stack with list/listitem roles
    const { getByTestId } = render(
      <NowCardStack
        feed={feed([
          card('unfinished_session', 'topic-1'),
          card('retention_due', 'topic-2'),
        ])}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(getByTestId('now-card-stack').props.accessibilityRole).toBe('list');
    // Slot Views are structural wrappers; React Native has no 'listitem' role.
    // Screen readers treat children of a 'list' container as list items implicitly.
    expect(getByTestId('now-card-slot-anchor')).toBeTruthy();
    expect(getByTestId('now-card-slot-module-0')).toBeTruthy();
  });

  it('threads anchor arc state and completion events into actionable cards', () => {
    const onCompleted = jest.fn();
    const anchor = card('retention_due', 'topic-1');
    const { getByTestId, getByText } = render(
      <NowCardStack
        feed={feed([anchor])}
        dismissedKeys={new Set()}
        anchorArcState="advancing"
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onCompleted={onCompleted}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(getByText('Getting stronger')).toBeTruthy();
    fireEvent.press(getByTestId('now-card-complete'));
    expect(onCompleted).toHaveBeenCalledWith(anchor);
  });
});
