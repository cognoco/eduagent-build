import { render, screen } from '@testing-library/react-native';
import type { ScopeDescriptor } from '@eduagent/schemas';

import { SupportHubJournalTab } from './SupportHubJournalTab';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'supportHub.journal.title': 'Journal',
        'supportHub.journal.subtitle':
          'Support records sent to you, grouped by learner.',
        'supportHub.journal.personHint': 'Updates shared with you appear here.',
        'supportHub.journal.personPlaceholderTitle': 'No shareable updates yet',
        'supportHub.journal.emptyMessage': `When ${
          opts?.name ?? 'this learner'
        } finishes a session or report, updates shared with you will appear here.`,
        'supportHub.journal.personPlaceholderMessage':
          'Private chats, notes, and mentor memory are not shown here.',
      };
      return map[key] ?? key;
    },
  }),
}));

const EMMA_SCOPE: Extract<ScopeDescriptor, { kind: 'person' }> = {
  kind: 'person',
  personId: '550e8400-e29b-41d4-a716-446655440000',
  edgeId: '660e8400-e29b-41d4-a716-446655440001',
  displayName: 'Emma',
};

describe('SupportHubJournalTab', () => {
  it('renders an honest empty journal state for each supported person', () => {
    render(<SupportHubJournalTab personScopes={[EMMA_SCOPE]} />);

    screen.getByTestId(
      `support-hub-journal-empty-lamp-${EMMA_SCOPE.personId}`,
      {
        includeHiddenElements: true,
      },
    );
    screen.getByTestId(`support-hub-journal-empty-pen-${EMMA_SCOPE.personId}`, {
      includeHiddenElements: true,
    });
    screen.getByText('No shareable updates yet');
    screen.getByText(
      'When Emma finishes a session or report, updates shared with you will appear here.',
    );
    screen.getByText(
      'Private chats, notes, and mentor memory are not shown here.',
    );

    expect(screen.queryByText('No shared record yet')).toBeNull();
  });
});
