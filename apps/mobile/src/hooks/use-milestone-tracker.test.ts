import { act, renderHook } from '@testing-library/react-native';
import {
  advanceMilestoneTracker,
  createMilestoneTrackerStateFromMilestones,
  celebrationForReason,
  getMilestoneLabel,
  INITIAL_MILESTONE_TRACKER_STATE,
  useMilestoneTracker,
} from './use-milestone-tracker';

describe('celebrationForReason', () => {
  it('maps effort milestones to the shared celebration tiers', () => {
    expect(celebrationForReason('deep_diver')).toBe('polar_star');
    expect(celebrationForReason('persistent')).toBe('twin_stars');
  });
});

describe('getMilestoneLabel', () => {
  it('returns friendly labels for summary recap', () => {
    expect(getMilestoneLabel('comet')).toContain('breakthrough');
    expect(getMilestoneLabel('persistent')).toContain('kept going');
  });
});

describe('useMilestoneTracker', () => {
  it('triggers milestones only once per session', () => {
    const { result } = renderHook(() => useMilestoneTracker());

    let first: string[] = [];
    let second: string[] = [];

    act(() => {
      first = result.current.trackExchange({
        userMessage:
          'This is a long thoughtful answer that clearly passes fifty characters.',
        escalationRung: 2,
      }).triggered;
      second = result.current.trackExchange({
        userMessage:
          'Another long thoughtful answer that clearly passes fifty characters.',
        escalationRung: 2,
      }).triggered;
    });

    expect(first).toContain('polar_star');
    expect(second).not.toContain('polar_star');
  });

  it('detects breakthrough, streak, and effort milestones', () => {
    const { result } = renderHook(() => useMilestoneTracker());

    act(() => {
      result.current.trackExchange({
        userMessage: 'Need help please',
        escalationRung: 4,
      });
    });

    let triggered: string[] = [];
    act(() => {
      triggered = result.current.trackExchange({
        userMessage:
          'Here is my detailed explanation that is definitely longer than fifty characters.',
        escalationRung: 2,
      }).triggered;
      result.current.trackExchange({
        userMessage:
          'Second detailed explanation that is definitely longer than fifty characters.',
        escalationRung: 2,
      });
      result.current.trackExchange({
        userMessage:
          'Third detailed explanation that is definitely longer than fifty characters.',
        escalationRung: 2,
      });
      result.current.trackExchange({
        userMessage: 'Fourth solid answer that keeps the streak going nicely.',
        escalationRung: 2,
      });
      result.current.trackExchange({
        userMessage: 'Fifth solid answer that completes the mastery streak.',
        escalationRung: 2,
      });
    });

    expect(triggered).toEqual(
      expect.arrayContaining(['polar_star', 'comet', 'persistent']),
    );
    expect(result.current.milestonesReached).toEqual(
      expect.arrayContaining([
        'polar_star',
        'twin_stars',
        'comet',
        'orions_belt',
        'deep_diver',
        'persistent',
      ]),
    );
  });

  it('restores tracker state without re-triggering already earned milestones', () => {
    const restored = createMilestoneTrackerStateFromMilestones([
      'polar_star',
      'twin_stars',
    ]);
    const { result } = renderHook(() => useMilestoneTracker());

    act(() => {
      result.current.hydrate({
        ...restored,
        consecutiveLowRung: 3,
        previousRung: 2,
      });
    });

    let nextTriggered: string[] = [];
    act(() => {
      nextTriggered = result.current.trackExchange({
        userMessage: 'Another solid answer after resuming the session.',
        escalationRung: 2,
      }).triggered;
    });

    expect(nextTriggered).not.toContain('polar_star');
    expect(nextTriggered).not.toContain('twin_stars');
    expect(result.current.milestonesReached).toEqual(
      expect.arrayContaining(['polar_star', 'twin_stars']),
    );
  });
});

describe('advanceMilestoneTracker', () => {
  it('returns the next tracker snapshot for persistence', () => {
    const result = advanceMilestoneTracker(INITIAL_MILESTONE_TRACKER_STATE, {
      userMessage:
        'This is a detailed response that is definitely longer than fifty characters.',
      escalationRung: 2,
    });

    expect(result.triggered).toContain('polar_star');
    expect(result.trackerState.previousRung).toBe(2);
    expect(result.trackerState.milestonesReached).toContain('polar_star');
  });
});
