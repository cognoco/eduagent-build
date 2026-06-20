import { fireEvent, render, screen } from '@testing-library/react-native';

import { ContractCard } from './ContractCard';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const CONTRACT = {
  id: '00000000-0000-4000-8000-000000000001',
  supportershipId: '00000000-0000-4000-8000-000000000002',
  supporterPersonId: '00000000-0000-4000-8000-000000000003',
  supporteePersonId: '00000000-0000-4000-8000-000000000004',
  relation: 'teacher' as const,
  status: 'pending' as const,
  contractVersion: 1,
  reportableKinds: ['mastery' as const, 'effort' as const],
  artifactWall: true as const,
  renderEquivalence: true as const,
  safetyException: true as const,
  supporterAcceptedAt: null,
  supporteeAcceptedAt: null,
  createdAt: '2026-06-20T12:00:00.000Z',
  updatedAt: '2026-06-20T12:00:00.000Z',
};

describe('ContractCard', () => {
  it('discloses artifact wall and render equivalence to the supportee', () => {
    render(
      <ContractCard
        contract={CONTRACT}
        audience="supportee"
        supporterName="Zuzana"
        onAccept={jest.fn()}
      />,
    );

    screen.getByText('Visibility contract');
    screen.getByText('Zuzana wants to support you as your teacher.');
    screen.getByText('Private chats, notes and journal artifacts stay hidden.');
    screen.getByText('Both sides see the same facts, framed for their role.');
  });

  it('invokes accept when the contract is not yet accepted', () => {
    const onAccept = jest.fn();
    render(
      <ContractCard
        contract={CONTRACT}
        audience="supporter"
        supporteeName="Emma"
        onAccept={onAccept}
      />,
    );

    fireEvent.press(screen.getByTestId('visibility-contract-accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
