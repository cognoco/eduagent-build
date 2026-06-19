import { render, fireEvent } from '@testing-library/react-native';
import type { NowCard as NowCardData } from '@eduagent/schemas';

import { LedgerMomentCard } from './LedgerMomentCard';

const ledgerCard: NowCardData = {
  kind: 'ledger_moment',
  templateKey: 'now.ledger_moment.session_filed',
  params: { topicTitle: 'World capitals', ledgerKind: 'session_filed' },
  deepLink: {
    route: 'subject.hub',
    params: { subjectId: 'subject-1' },
    chain: [],
  },
  scope: 'self',
};

describe('LedgerMomentCard', () => {
  it('renders ledger copy from the server template key without a data provider', () => {
    const { getByTestId, getByText } = render(
      <LedgerMomentCard
        card={ledgerCard}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
      />,
    );

    expect(getByTestId('now-ledger-moment')).toBeTruthy();
    expect(
      getByText('Saved World capitals to your learning record.'),
    ).toBeTruthy();
  });

  it('fires continue on card press and decline on dismiss', () => {
    const onContinue = jest.fn();
    const onDecline = jest.fn();
    const { getByTestId } = render(
      <LedgerMomentCard
        card={ledgerCard}
        onContinue={onContinue}
        onDecline={onDecline}
      />,
    );

    fireEvent.press(getByTestId('now-ledger-moment'));
    expect(onContinue).toHaveBeenCalledWith(ledgerCard);

    fireEvent.press(getByTestId('now-ledger-dismiss'));
    expect(onDecline).toHaveBeenCalledWith(ledgerCard);
  });
});
