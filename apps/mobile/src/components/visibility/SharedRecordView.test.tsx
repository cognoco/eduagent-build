import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SharedRecord } from '@eduagent/schemas';

import { SharedRecordView } from './SharedRecordView';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const RECORD: SharedRecord = {
  supportershipId: '00000000-0000-4000-8000-000000000001',
  generatedAt: '2026-06-20T12:00:00.000Z',
  factIds: ['fact-1'],
  supporterView: {
    audience: 'supporter',
    factIds: ['fact-1'],
    headline: 'Emma has 1 shareable update.',
    facts: [
      {
        id: 'fact-1',
        kind: 'effort',
        title: 'Practiced fractions',
        detail: 'Completed the review set.',
        source: 'session',
      },
    ],
  },
  supporteeView: {
    audience: 'supportee',
    factIds: ['fact-1'],
    headline: 'Your supporter can see 1 shareable update.',
    facts: [
      {
        id: 'fact-1',
        kind: 'effort',
        title: 'Practiced fractions',
        detail: 'Completed the review set.',
        source: 'session',
      },
    ],
  },
};

describe('SharedRecordView', () => {
  it('renders structural facts without artifact text', () => {
    render(<SharedRecordView record={RECORD} />);

    screen.getByText('Emma has 1 shareable update.');
    screen.getByText('Structural facts only. No raw notes or chat text.');
    screen.getByText('Practiced fractions');
    expect(screen.queryByText(/raw chat/i)).toBeNull();
  });

  it('routes fetch errors through ErrorFallback', () => {
    const onRetry = jest.fn();
    render(<SharedRecordView error={new Error('nope')} onRetry={onRetry} />);

    screen.getByTestId('visibility-shared-record-error');
    fireEvent.press(screen.getByTestId('visibility-shared-record-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
