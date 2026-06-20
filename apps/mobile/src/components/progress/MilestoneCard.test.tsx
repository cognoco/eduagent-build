import { render, screen } from '@testing-library/react-native';
import type { MilestoneRecord } from '@eduagent/schemas';
import { MilestoneCard } from './MilestoneCard';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

function makeMilestone(
  overrides: Partial<MilestoneRecord> = {},
): MilestoneRecord {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    profileId: '00000000-0000-0000-0000-000000000002',
    milestoneType: 'session_count',
    threshold: 10,
    subjectId: null,
    bookId: null,
    metadata: null,
    celebratedAt: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('MilestoneCard', () => {
  it('renders a graceful fallback for an unrecognized milestoneType without throwing', () => {
    // The milestone_type DB column is free-text, so a value outside the
    // schema enum can reach the component at runtime. Cast through unknown to
    // simulate that — the strict enum type would otherwise reject it.
    const milestone = makeMilestone({
      milestoneType: 'totally_unknown_type' as MilestoneRecord['milestoneType'],
    });

    expect(() => render(<MilestoneCard milestone={milestone} />)).not.toThrow();
    // en.json → progress.milestoneCard.unknown
    expect(screen.getByText('Milestone reached'));
  });

  it('renders the normal copy and icon for a known milestoneType', () => {
    const milestone = makeMilestone({
      milestoneType: 'session_count',
      threshold: 10,
    });

    render(<MilestoneCard milestone={milestone} />);
    // en.json → milestoneCard.sessionCount_other
    expect(screen.getByText('10 learning sessions completed'));
    // Known config emits its specific icon, not the generic fallback label.
    expect(screen.queryByText('Milestone reached')).toBeNull();
  });
});
