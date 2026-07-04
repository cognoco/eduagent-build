import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ScopeDescriptor } from '@eduagent/schemas';

import { SupportHubSubjectsTab } from './SupportHubSubjectsTab';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const EMMA_SCOPE: Extract<ScopeDescriptor, { kind: 'person' }> = {
  kind: 'person',
  personId: '550e8400-e29b-41d4-a716-446655440101',
  edgeId: '550e8400-e29b-41d4-a716-446655440201',
  displayName: 'Emma',
};

describe('SupportHubSubjectsTab', () => {
  it('renders each supported person and opens their scope on press', () => {
    const onOpenPersonScope = jest.fn();

    render(
      <SupportHubSubjectsTab
        personScopes={[EMMA_SCOPE]}
        onOpenPersonScope={onOpenPersonScope}
      />,
    );

    fireEvent.press(
      screen.getByTestId(`support-hub-subjects-person-${EMMA_SCOPE.personId}`),
    );
    expect(onOpenPersonScope).toHaveBeenCalledWith(EMMA_SCOPE);
  });

  // WI-1393 A3: the Subjects empty state opens the eligible-person picker
  // and forwards the selection so /(app)/link/new is reachable from here too.
  it('opens the eligible-person picker from the empty state and forwards the selection', () => {
    const onSelectEligiblePerson = jest.fn();

    render(
      <SupportHubSubjectsTab
        personScopes={[]}
        onOpenPersonScope={jest.fn()}
        eligiblePersons={[{ id: 'child-new', displayName: 'Liam' }]}
        onSelectEligiblePerson={onSelectEligiblePerson}
      />,
    );

    fireEvent.press(screen.getByTestId('support-hub-subjects-empty-add'));
    fireEvent.press(
      screen.getByTestId('support-person-picker-option-child-new'),
    );

    expect(onSelectEligiblePerson).toHaveBeenCalledWith({
      id: 'child-new',
      displayName: 'Liam',
    });
  });

  // WI-1393 AC2: zero eligible persons degrades to add-a-child, never a
  // param-less push to /link/new.
  it('degrades the empty state to add-a-child when there are no eligible persons', () => {
    const onAddChildFallback = jest.fn();
    const onSelectEligiblePerson = jest.fn();

    render(
      <SupportHubSubjectsTab
        personScopes={[]}
        onOpenPersonScope={jest.fn()}
        eligiblePersons={[]}
        onSelectEligiblePerson={onSelectEligiblePerson}
        onAddChildFallback={onAddChildFallback}
      />,
    );

    fireEvent.press(screen.getByTestId('support-hub-subjects-empty-add'));
    screen.getByTestId('support-person-picker-empty');

    fireEvent.press(screen.getByTestId('support-person-picker-add-child'));

    expect(onAddChildFallback).toHaveBeenCalledTimes(1);
    expect(onSelectEligiblePerson).not.toHaveBeenCalled();
  });
});
