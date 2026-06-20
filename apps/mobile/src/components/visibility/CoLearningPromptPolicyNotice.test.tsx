import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CoLearningPromptPayload } from '@eduagent/schemas';

import { CoLearningPromptPolicyNotice } from './CoLearningPromptPolicyNotice';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const PAYLOAD: CoLearningPromptPayload = {
  supportershipId: '00000000-0000-4000-8000-000000000001',
  supporterPersonId: '00000000-0000-4000-8000-000000000002',
  supporteePersonId: '00000000-0000-4000-8000-000000000003',
  suggestedText: 'Zuzana learned this too. Want to explain it back?',
  dismissible: true,
  fillOnly: true,
  readReceipt: false,
};

describe('CoLearningPromptPolicyNotice', () => {
  it('fills the composer instead of sending and can be dismissed', () => {
    const onFill = jest.fn();
    const onDismiss = jest.fn();
    render(
      <CoLearningPromptPolicyNotice
        payload={PAYLOAD}
        onFill={onFill}
        onDismiss={onDismiss}
      />,
    );

    screen.getByText('Optional explain-back');
    fireEvent.press(screen.getByTestId('visibility-co-learning-fill'));
    fireEvent.press(screen.getByTestId('visibility-co-learning-dismiss'));

    expect(onFill).toHaveBeenCalledWith(PAYLOAD.suggestedText);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
