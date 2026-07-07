import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AppealReport, SharedRecord } from '@eduagent/schemas';

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
    screen.getByTestId('structural-fact-fact-1');
    expect(screen.queryByText(/raw chat/i)).toBeNull();
  });

  it('routes fetch errors through ErrorFallback', () => {
    const onRetry = jest.fn();
    render(<SharedRecordView error={new Error('nope')} onRetry={onRetry} />);

    screen.getByTestId('visibility-shared-record-error');
    fireEvent.press(screen.getByTestId('visibility-shared-record-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render the appeal affordance when onAppeal is not provided', () => {
    render(<SharedRecordView record={RECORD} />);

    expect(screen.queryByTestId('visibility-appeal-button')).toBeNull();
  });

  it('renders the appeal button and triggers onAppeal when pressed', () => {
    const onAppeal = jest.fn();
    render(<SharedRecordView record={RECORD} onAppeal={onAppeal} />);

    const button = screen.getByTestId('visibility-appeal-button');
    fireEvent.press(button);
    expect(onAppeal).toHaveBeenCalledTimes(1);
  });

  it('shows a pending indicator while the appeal is in flight', () => {
    render(
      <SharedRecordView record={RECORD} onAppeal={jest.fn()} appealPending />,
    );

    screen.getByTestId('visibility-appeal-pending');
    expect(screen.queryByTestId('visibility-appeal-button')).toBeNull();
  });

  it('renders the attention report once the appeal succeeds', () => {
    const APPEAL_REPORT: AppealReport = {
      supportershipId: RECORD.supportershipId,
      generatedAt: '2026-07-01T12:00:00.000Z',
      report: 'Detailed attention report: no shareable updates yet.',
      facts: [],
      artifactWall: true,
    };

    render(
      <SharedRecordView
        record={RECORD}
        onAppeal={jest.fn()}
        appealReport={APPEAL_REPORT}
      />,
    );

    screen.getByTestId('visibility-appeal-report');
    screen.getByText(APPEAL_REPORT.report);
    expect(screen.queryByTestId('visibility-appeal-button')).toBeNull();
  });

  it('routes appeal failures through ErrorFallback with retry', () => {
    const onRetryAppeal = jest.fn();
    render(
      <SharedRecordView
        record={RECORD}
        onAppeal={jest.fn()}
        appealError={new Error('nope')}
        onRetryAppeal={onRetryAppeal}
      />,
    );

    screen.getByTestId('visibility-appeal-error');
    fireEvent.press(screen.getByTestId('visibility-appeal-retry'));
    expect(onRetryAppeal).toHaveBeenCalledTimes(1);
  });
});
