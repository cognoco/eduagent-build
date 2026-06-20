import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SupporterScopeList } from '@eduagent/schemas';

import { ScopeChip } from './ScopeChip';
import { ScopeContextProvider } from '../../lib/scope-context';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const personScope = {
  kind: 'person' as const,
  personId: '00000000-0000-4000-8000-000000000101',
  edgeId: '00000000-0000-4000-8000-000000000201',
  displayName: 'Emma',
};

function renderChip(scopeList: SupporterScopeList) {
  return render(
    <ScopeContextProvider initialScopeList={scopeList}>
      <ScopeChip />
    </ScopeContextProvider>,
  );
}

describe('ScopeChip', () => {
  it('renders nothing for learner shape', () => {
    renderChip({ shape: 'learner' });

    expect(screen.queryByTestId('scope-chip')).toBeNull();
  });

  it('renders supporter scopes and switches selection on press', () => {
    renderChip({
      shape: 'supporter',
      scopes: [{ kind: 'supporter-hub' }, personScope, { kind: 'me' }],
      defaultScopeIndex: 0,
    });

    expect(screen.getByTestId('scope-chip')).toBeTruthy();
    expect(screen.getByText('Support hub')).toBeTruthy();
    expect(screen.getByText('Emma')).toBeTruthy();
    expect(screen.getByText('Me')).toBeTruthy();

    const personButton = screen.getByTestId(
      'scope-chip-option-person-00000000-0000-4000-8000-000000000101',
    );
    fireEvent.press(personButton);

    expect(personButton.props.accessibilityState).toEqual({ selected: true });
  });
});
