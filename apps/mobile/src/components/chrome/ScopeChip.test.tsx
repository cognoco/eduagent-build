import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { SupporterScopeList } from '@eduagent/schemas';

import { ScopeChip } from './ScopeChip';
import { ScopeContextProvider } from '../../lib/scope-context';
import * as SecureStore from '../../lib/secure-storage';

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

function renderChip(scopeList: SupporterScopeList, profileId?: string) {
  return render(
    <ScopeContextProvider
      initialScopeList={scopeList}
      initialProfileId={profileId}
    >
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

  it('[WI-2176] exposes the E2E persistence receipt only after SecureStore commits the selected scope', async () => {
    const previousE2E = process.env.EXPO_PUBLIC_E2E;
    let resolveWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const setItemSpy = jest
      .spyOn(SecureStore, 'setItemAsync')
      .mockReturnValue(pendingWrite);

    process.env.EXPO_PUBLIC_E2E = 'true';
    try {
      renderChip(
        {
          shape: 'supporter',
          scopes: [{ kind: 'supporter-hub' }, personScope, { kind: 'me' }],
          defaultScopeIndex: 0,
        },
        '00000000-0000-4000-8000-000000000901',
      );

      fireEvent.press(screen.getByTestId('scope-chip-option-me'));

      expect(
        screen.getByTestId('scope-chip-option-me').props.accessibilityState,
      ).toEqual({ selected: true });
      expect(screen.queryByTestId('scope-chip-persisted-me')).toBeNull();

      await act(async () => {
        resolveWrite();
        await pendingWrite;
      });

      await waitFor(() => {
        expect(screen.getByTestId('scope-chip-persisted-me')).toBeTruthy();
      });
    } finally {
      setItemSpy.mockRestore();
      if (previousE2E === undefined) {
        delete process.env.EXPO_PUBLIC_E2E;
      } else {
        process.env.EXPO_PUBLIC_E2E = previousE2E;
      }
    }
  });
});
