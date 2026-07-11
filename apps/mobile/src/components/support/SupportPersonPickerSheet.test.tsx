import {
  fireEvent,
  render,
  screen,
  cleanup,
} from '@testing-library/react-native';

import { SupportPersonPickerSheet } from './SupportPersonPickerSheet';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

describe('SupportPersonPickerSheet', () => {
  it('lists eligible managed persons and selects one', () => {
    const onSelectPerson = jest.fn();
    const onAddChild = jest.fn();
    const onClose = jest.fn();

    render(
      <SupportPersonPickerSheet
        visible
        eligiblePersons={[
          { id: 'child-a', displayName: 'Emma' },
          { id: 'child-b', displayName: 'Noah' },
        ]}
        onSelectPerson={onSelectPerson}
        onAddChild={onAddChild}
        onClose={onClose}
      />,
    );

    screen.getByText('Choose a learner');
    screen.getByText('Emma');
    screen.getByText('Noah');
    expect(screen.queryByTestId('support-person-picker-empty')).toBeNull();

    fireEvent.press(screen.getByTestId('support-person-picker-option-child-a'));
    expect(onSelectPerson).toHaveBeenCalledWith({
      id: 'child-a',
      displayName: 'Emma',
    });
    expect(onAddChild).not.toHaveBeenCalled();
  });

  it('degrades to an add-child affordance when there are zero eligible persons', () => {
    const onSelectPerson = jest.fn();
    const onAddChild = jest.fn();
    const onClose = jest.fn();

    render(
      <SupportPersonPickerSheet
        visible
        eligiblePersons={[]}
        onSelectPerson={onSelectPerson}
        onAddChild={onAddChild}
        onClose={onClose}
      />,
    );

    screen.getByTestId('support-person-picker-empty');
    screen.getByText('No learners available yet');

    fireEvent.press(screen.getByTestId('support-person-picker-add-child'));
    expect(onAddChild).toHaveBeenCalledTimes(1);
    expect(onSelectPerson).not.toHaveBeenCalled();
  });

  // [WI-1137 Codex P2] the existing-family-member entry must be reachable
  // regardless of how many eligible managed persons exist — it must not be
  // buried inside (or gated by) the zero-eligible degrade path.
  it('offers a persistent "link an existing family member" option in both the populated and empty states', () => {
    const onSelectExistingTeen = jest.fn();

    render(
      <SupportPersonPickerSheet
        visible
        eligiblePersons={[{ id: 'child-a', displayName: 'Emma' }]}
        onSelectPerson={jest.fn()}
        onAddChild={jest.fn()}
        onSelectExistingTeen={onSelectExistingTeen}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('support-person-picker-existing-teen'));
    expect(onSelectExistingTeen).toHaveBeenCalledTimes(1);

    cleanup();
    onSelectExistingTeen.mockClear();

    render(
      <SupportPersonPickerSheet
        visible
        eligiblePersons={[]}
        onSelectPerson={jest.fn()}
        onAddChild={jest.fn()}
        onSelectExistingTeen={onSelectExistingTeen}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('support-person-picker-existing-teen'));
    expect(onSelectExistingTeen).toHaveBeenCalledTimes(1);
  });
});
