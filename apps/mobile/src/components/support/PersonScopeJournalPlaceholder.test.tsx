import { render, screen } from '@testing-library/react-native';
import type { ScopeDescriptor } from '@eduagent/schemas';

import { PersonScopeJournalPlaceholder } from './PersonScopeJournalPlaceholder';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
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

describe('PersonScopeJournalPlaceholder', () => {
  it('shows a visual empty state without rendering a fake shared record', () => {
    render(<PersonScopeJournalPlaceholder scope={EMMA_SCOPE} />);

    screen.getByTestId('person-scope-journal-empty-lamp', {
      includeHiddenElements: true,
    });
    screen.getByTestId('person-scope-journal-empty-pen', {
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
