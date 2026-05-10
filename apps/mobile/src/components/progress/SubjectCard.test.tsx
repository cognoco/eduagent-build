import { fireEvent, render, screen } from '@testing-library/react-native';
import { SubjectCard, hasSubjectActivity } from './SubjectCard';
import type { SubjectInventory } from '@eduagent/schemas';

jest.mock('./AccordionTopicList', () => {
  const { Text } = require('react-native');

  return {
    AccordionTopicList: ({ expanded }: { expanded: boolean }) =>
      expanded ? <Text testID="mock-topic-list">Topics visible</Text> : null,
  };
});

function makeSubject(
  overrides: Partial<SubjectInventory> = {},
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

describe('SubjectCard headline', () => {
  it('shows a unified started and mastered headline for curriculum subjects', () => {
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
          wallClockMinutes: 120,
          sessionsCount: 5,
        })}
        testID="card"
      />,
    );

    // startedCount = inProgress(1) + mastered(2) = 3
    screen.getByText('3 topics started · 2 mastered');
    screen.getByText('2h · 5 sessions');
    screen.getByTestId('card-bar');
  });

  it('keeps zero mastery visible in the headline', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: {
            total: 13,
            explored: 2,
            mastered: 0,
            inProgress: 2,
            notStarted: 11,
          },
          wallClockMinutes: 69,
          sessionsCount: 2,
        })}
        testID="card"
      />,
    );

    // startedCount = inProgress(2) + mastered(0) = 2
    screen.getByText('2 topics started · 0 mastered');
  });

  // [BUG-880] Subjects with sessions but zero started topics previously
  // showed "X sessions completed" as the headline while peers showed
  // "X topics started · Y mastered" — making it look as if some subjects
  // had richer tracking when they were just at a different stage. Use the
  // unified topic-based schema everywhere; sessions still surface in the
  // subline.
  it('uses the unified topic headline even when sessions exist but topics are still zero [BUG-880]', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          sessionsCount: 2,
          wallClockMinutes: 69,
        })}
        testID="card"
      />,
    );

    screen.getByText('0 topics started · 0 mastered');
    expect(screen.queryByText('2 sessions completed')).toBeNull();
    // Sessions still visible in the subline.
    screen.getByText(/2 sessions/);
    // Bar is rendered (topics.total is not null in the default fixture).
    screen.getByTestId('card-bar');
  });

  it('hides the progress bar for open-ended subjects', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: {
            total: null,
            explored: 3,
            mastered: 1,
            inProgress: 2,
            notStarted: 0,
          },
          sessionsCount: 4,
          wallClockMinutes: 80,
        })}
        testID="card"
      />,
    );

    // startedCount = inProgress(2) + mastered(1) = 3
    screen.getByText('3 topics started · 1 mastered');
    expect(screen.queryByTestId('card-bar')).toBeNull();
  });

  it('shows the unified zero-state headline when there is no activity', () => {
    render(<SubjectCard subject={makeSubject()} testID="card" />);

    screen.getByText('0 topics started · 0 mastered');
    screen.getByText('0 min · 0 sessions');
    screen.getByTestId('card-bar');
  });
});

describe('SubjectCard accordion mode', () => {
  it('toggles expanded state on tap', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: {
            total: 13,
            explored: 1,
            mastered: 0,
            inProgress: 1,
            notStarted: 11,
          },
          sessionsCount: 3,
          wallClockMinutes: 60,
        })}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />,
    );

    screen.getByText('▾ See topics');
    expect(screen.queryByTestId('mock-topic-list')).toBeNull();

    fireEvent.press(screen.getByTestId('card'));
    screen.getByText('▴ Hide topics');
    screen.getByTestId('mock-topic-list');

    fireEvent.press(screen.getByTestId('card'));
    screen.getByText('▾ See topics');
    expect(screen.queryByTestId('mock-topic-list')).toBeNull();
  });

  it('sets accordion accessibility metadata', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: {
            total: 13,
            explored: 0,
            mastered: 0,
            inProgress: 1,
            notStarted: 12,
          },
          sessionsCount: 1,
          wallClockMinutes: 10,
        })}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />,
    );

    const card = screen.getByTestId('card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityState).toEqual({ expanded: false });
  });

  it('hides the see-topics hint when there is no activity to expand', () => {
    render(
      <SubjectCard
        subject={makeSubject()}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />,
    );

    expect(screen.queryByText('▾ See topics')).toBeNull();
  });

  it('stays in navigation mode when onPress is provided', () => {
    const onPress = jest.fn();

    render(
      <SubjectCard
        subject={makeSubject({
          sessionsCount: 2,
          wallClockMinutes: 30,
        })}
        onPress={onPress}
        testID="card"
      />,
    );

    fireEvent.press(screen.getByTestId('card'));

    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByText('▾ See topics')).toBeNull();
    expect(screen.queryByTestId('mock-topic-list')).toBeNull();
  });
});

describe('SubjectCard action label [IMP-1]', () => {
  it('shows "Explore" for an untouched subject with zero activity', () => {
    const onAction = jest.fn();
    render(
      <SubjectCard subject={makeSubject()} onAction={onAction} testID="card" />,
    );

    screen.getByText('Explore');
    expect(screen.queryByText('Continue')).toBeNull();
  });

  it('shows "Continue" for a subject with activity and remaining topics', () => {
    const onAction = jest.fn();
    render(
      <SubjectCard
        subject={makeSubject({
          sessionsCount: 3,
          wallClockMinutes: 45,
          topics: {
            total: 13,
            explored: 2,
            mastered: 1,
            inProgress: 1,
            notStarted: 9,
          },
        })}
        onAction={onAction}
        testID="card"
      />,
    );

    screen.getByText('Continue');
  });

  it('shows "Explore" when all topics are completed', () => {
    const onAction = jest.fn();
    render(
      <SubjectCard
        subject={makeSubject({
          sessionsCount: 10,
          wallClockMinutes: 300,
          topics: {
            total: 13,
            explored: 13,
            mastered: 13,
            inProgress: 0,
            notStarted: 0,
          },
        })}
        onAction={onAction}
        testID="card"
      />,
    );

    screen.getByText('Explore');
  });
});

describe('hasSubjectActivity', () => {
  it('returns false for subjects with no sessions or topic activity', () => {
    expect(hasSubjectActivity(makeSubject())).toBe(false);
  });

  it('returns true when a subject has sessions', () => {
    expect(hasSubjectActivity(makeSubject({ sessionsCount: 2 }))).toBe(true);
  });

  it('returns true when a subject has mastered topics from legacy data', () => {
    expect(
      hasSubjectActivity(
        makeSubject({
          topics: {
            total: 13,
            explored: 0,
            mastered: 1,
            inProgress: 0,
            notStarted: 12,
          },
        }),
      ),
    ).toBe(true);
  });

  it('returns true when a subject has in-progress topics', () => {
    expect(
      hasSubjectActivity(
        makeSubject({
          topics: {
            total: 13,
            explored: 0,
            mastered: 0,
            inProgress: 1,
            notStarted: 12,
          },
        }),
      ),
    ).toBe(true);
  });
});
