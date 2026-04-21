import { render, screen } from '@testing-library/react-native';
import { SubjectCard } from './SubjectCard';
import type { SubjectInventory } from '@eduagent/schemas';

function makeSubject(
  overrides: Partial<SubjectInventory> = {}
): SubjectInventory {
  return {
    subjectId: 'sub-1',
    subjectName: 'Mathematics',
    pedagogyMode: 'socratic',
    topics: {
      total: 13,
      explored: 0,
      mastered: 0,
      inProgress: 0,
      notStarted: 13,
    },
    vocabulary: { total: 0, mastered: 0, learning: 0, new: 0, byCefrLevel: {} },
    estimatedProficiency: null,
    estimatedProficiencyLabel: null,
    lastSessionAt: null,
    activeMinutes: 0,
    wallClockMinutes: 0,
    sessionsCount: 0,
    ...overrides,
  };
}

describe('SubjectCard getTopicHeadline', () => {
  it('shows "0/13 topics mastered" when truly no activity', () => {
    render(<SubjectCard subject={makeSubject()} testID="card" />);

    expect(screen.getByText('0/13 topics mastered')).toBeTruthy();
  });

  it('shows "N topics studied" when explored > 0 [BUG-527]', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: {
            total: 13,
            explored: 2,
            mastered: 0,
            inProgress: 0,
            notStarted: 11,
          },
          sessionsCount: 2,
          wallClockMinutes: 69,
        })}
        testID="card"
      />
    );

    // Primary headline should show engagement, not bare "0/13 mastered"
    expect(screen.getByText('2 topics studied')).toBeTruthy();
    expect(screen.getByText('0/13 mastered')).toBeTruthy();
  });

  it('shows session count when sessions > 0 but no topics classified [BUG-525]', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: {
            total: 13,
            explored: 0,
            mastered: 0,
            inProgress: 0,
            notStarted: 13,
          },
          sessionsCount: 2,
          wallClockMinutes: 69,
        })}
        testID="card"
      />
    );

    expect(screen.getByText('2 sessions completed')).toBeTruthy();
  });

  it('shows combined touched count including mastered and inProgress', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: {
            total: 13,
            explored: 1,
            mastered: 2,
            inProgress: 1,
            notStarted: 9,
          },
          sessionsCount: 5,
          wallClockMinutes: 120,
        })}
        testID="card"
      />
    );

    // 1 explored + 2 mastered + 1 inProgress = 4 topics studied
    expect(screen.getByText('4 topics studied')).toBeTruthy();
    expect(screen.getByText('2/13 mastered')).toBeTruthy();
  });

  it('shows singular "topic" for 1 topic studied', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: {
            total: 13,
            explored: 0,
            mastered: 1,
            inProgress: 0,
            notStarted: 12,
          },
          sessionsCount: 1,
          wallClockMinutes: 30,
        })}
        testID="card"
      />
    );

    expect(screen.getByText('1 topic studied')).toBeTruthy();
  });

  it('shows open-ended headline for subjects with no fixed goal', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: {
            total: null as unknown as number,
            explored: 5,
            mastered: 2,
            inProgress: 1,
            notStarted: 0,
          },
          sessionsCount: 8,
          wallClockMinutes: 200,
        })}
        testID="card"
      />
    );

    expect(screen.getByText('5 topics explored')).toBeTruthy();
  });
});
