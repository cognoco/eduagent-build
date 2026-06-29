import { render, fireEvent } from '@testing-library/react-native';
import type { NowCard as NowCardData } from '@eduagent/schemas';

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
});
