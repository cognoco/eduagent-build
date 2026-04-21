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

describe('SubjectCard headline', () => {
  it('shows a unified studied and mastered headline for curriculum subjects', () => {
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
      />
    );

    expect(screen.getByText('4 topics studied · 2 mastered')).toBeTruthy();
    expect(screen.getByText('2h · 5 sessions')).toBeTruthy();
    expect(screen.getByTestId('card-bar')).toBeTruthy();
  });

  it('keeps zero mastery visible in the headline', () => {
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
          wallClockMinutes: 69,
          sessionsCount: 2,
        })}
        testID="card"
      />
    );

    expect(screen.getByText('2 topics studied · 0 mastered')).toBeTruthy();
  });

  it('shows a session-based headline when sessions exist but topics are still zero', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          sessionsCount: 2,
          wallClockMinutes: 69,
        })}
        testID="card"
      />
    );

    expect(screen.getByText('2 sessions completed')).toBeTruthy();
    expect(screen.queryByTestId('card-bar')).toBeNull();
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
      />
    );

    expect(screen.getByText('6 topics studied · 1 mastered')).toBeTruthy();
    expect(screen.queryByTestId('card-bar')).toBeNull();
  });

  it('shows the unified zero-state headline when there is no activity', () => {
    render(<SubjectCard subject={makeSubject()} testID="card" />);

    expect(screen.getByText('0 topics studied · 0 mastered')).toBeTruthy();
    expect(screen.getByText('0 min · 0 sessions')).toBeTruthy();
    expect(screen.getByTestId('card-bar')).toBeTruthy();
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
      />
    );

    expect(screen.getByText('▾ See topics')).toBeTruthy();
    expect(screen.queryByTestId('mock-topic-list')).toBeNull();

    fireEvent.press(screen.getByTestId('card'));
    expect(screen.getByText('▴ Hide topics')).toBeTruthy();
    expect(screen.getByTestId('mock-topic-list')).toBeTruthy();

    fireEvent.press(screen.getByTestId('card'));
    expect(screen.getByText('▾ See topics')).toBeTruthy();
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
      />
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
      />
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
      />
    );

    fireEvent.press(screen.getByTestId('card'));

    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByText('▾ See topics')).toBeNull();
    expect(screen.queryByTestId('mock-topic-list')).toBeNull();
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
        })
      )
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
        })
      )
    ).toBe(true);
  });
});
