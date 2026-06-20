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

  it('renders the onboarding empty card only for an empty feed', () => {
    const { getByTestId, getByText } = render(
      <NowCardStack
        feed={feed([])}
        dismissedKeys={new Set()}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
        onShowOverflow={jest.fn()}
      />,
    );

    expect(getByTestId('now-empty-card')).toBeTruthy();
    expect(getByText('Nothing needs you right now')).toBeTruthy();
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
    expect(getByTestId('now-card-slot-module-0').props.accessibilityLabel).toBe(
      'module',
    );
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
