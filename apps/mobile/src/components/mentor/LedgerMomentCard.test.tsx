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

  it('falls back to generic copy for unsupported ledger moment kinds', () => {
    const futureCard: NowCardData = {
      ...ledgerCard,
      templateKey: 'now.ledger_moment.future_kind',
      params: { ledgerKind: 'future_kind', topicTitle: 'World capitals' },
    };
    const { getByText, queryByText } = render(
      <LedgerMomentCard
        card={futureCard}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
      />,
    );

    expect(getByText('A learning moment was saved.')).toBeTruthy();
    expect(queryByText('mentorHome.ledger.future_kind.title')).toBeNull();
  });

  it('renders explicit locked-in mentor notice copy', () => {
    const { getByText } = render(
      <LedgerMomentCard
        card={{
          ...ledgerCard,
          templateKey: 'now.ledger_moment.notice_locked_in',
          params: {
            ledgerKind: 'notice_locked_in',
            concept: 'changing signs',
            subjectName: 'Algebra',
          },
        }}
        onContinue={jest.fn()}
        onDecline={jest.fn()}
      />,
    );

    expect(getByText('You locked in changing signs.')).toBeTruthy();
  });

  it('renders milestone copy and preserves its Journal continue and dismiss actions', () => {
    const onContinue = jest.fn();
    const onDecline = jest.fn();
    const milestoneCard: NowCardData = {
      ...ledgerCard,
      templateKey: 'now.ledger_moment.milestone_reached',
      params: {
        ledgerKind: 'milestone_reached',
        milestoneType: 'session_count',
        threshold: 5,
      },
      deepLink: { route: 'journal', params: {}, chain: [] },
    };
    const { getByTestId, getByText } = render(
      <LedgerMomentCard
        card={milestoneCard}
        onContinue={onContinue}
        onDecline={onDecline}
      />,
    );

    expect(getByText('5 learning sessions completed')).toBeTruthy();

    fireEvent.press(getByTestId('now-ledger-moment'));
    expect(onContinue).toHaveBeenCalledWith(milestoneCard);

    fireEvent.press(getByTestId('now-ledger-dismiss'));
    expect(onDecline).toHaveBeenCalledWith(milestoneCard);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('fires continue on card press', () => {
    const onContinue = jest.fn();
    const { getByTestId } = render(
      <LedgerMomentCard
        card={ledgerCard}
        onContinue={onContinue}
        onDecline={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('now-ledger-moment'));
    expect(onContinue).toHaveBeenCalledWith(ledgerCard);
  });

  it('[WI-2110 AC-1] adds the Practice section to quiz personal-best Journal cards', () => {
    const onContinue = jest.fn();
    const quizBestCard: NowCardData = {
      ...ledgerCard,
      templateKey: 'now.ledger_moment.quiz_personal_best',
      params: { ledgerKind: 'quiz_personal_best', score: 9 },
      deepLink: { route: 'journal', params: {}, chain: [] },
    };
    const { getByTestId } = render(
      <LedgerMomentCard
        card={quizBestCard}
        onContinue={onContinue}
        onDecline={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('now-ledger-moment'));

    expect(onContinue).toHaveBeenCalledWith({
      ...quizBestCard,
      deepLink: {
        ...quizBestCard.deepLink,
        params: { section: 'practice' },
      },
    });
  });

  it('[WI-2110 AC-2] leaves an ambiguous Journal moment at the Journal root', () => {
    const onContinue = jest.fn();
    const futureCard: NowCardData = {
      ...ledgerCard,
      templateKey: 'now.ledger_moment.future_kind',
      params: { ledgerKind: 'future_kind' },
      deepLink: {
        route: 'journal',
        params: { section: 'notes', source: 'legacy' },
        chain: [],
      },
    };
    const { getByTestId } = render(
      <LedgerMomentCard
        card={futureCard}
        onContinue={onContinue}
        onDecline={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('now-ledger-moment'));

    expect(onContinue).toHaveBeenCalledWith({
      ...futureCard,
      deepLink: {
        ...futureCard.deepLink,
        params: { source: 'legacy' },
      },
    });
  });

  it('[WI-2110 AC-5] leaves non-Journal moment destinations unchanged', () => {
    const onContinue = jest.fn();
    const subjectCard: NowCardData = {
      ...ledgerCard,
      params: { ledgerKind: 'quiz_personal_best' },
    };
    const { getByTestId } = render(
      <LedgerMomentCard
        card={subjectCard}
        onContinue={onContinue}
        onDecline={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('now-ledger-moment'));

    expect(onContinue).toHaveBeenCalledWith(subjectCard);
  });

  it('fires decline on dismiss without continuing the card', () => {
    const onContinue = jest.fn();
    const onDecline = jest.fn();
    const { getByTestId } = render(
      <LedgerMomentCard
        card={ledgerCard}
        onContinue={onContinue}
        onDecline={onDecline}
      />,
    );

    fireEvent.press(getByTestId('now-ledger-dismiss'));
    expect(onDecline).toHaveBeenCalledWith(ledgerCard);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
