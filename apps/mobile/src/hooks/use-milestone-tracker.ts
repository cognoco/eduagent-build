import { useCallback, useRef, useState } from 'react';
import type { CelebrationName, CelebrationReason } from '@eduagent/schemas';

export function celebrationForReason(
  reason: CelebrationReason,
): CelebrationName {
  switch (reason) {
    case 'deep_diver':
      return 'polar_star';
    case 'persistent':
    case 'evaluate_success':
    case 'teach_back_success':
      return 'twin_stars';
    case 'topic_mastered':
    case 'streak_7':
    case 'curriculum_complete':
    case 'comet':
      return 'comet';
    case 'streak_30':
    case 'orions_belt':
      return 'orions_belt';
    case 'polar_star':
      return 'polar_star';
    case 'twin_stars':
      return 'twin_stars';
    default:
      return 'polar_star';
  }
}

export function getMilestoneLabel(reason: CelebrationReason): string {
  switch (reason) {
    case 'polar_star':
      return 'Polar Star - first independent answer';
    case 'twin_stars':
      return 'Twin Stars - three strong answers in a row';
    case 'comet':
      return 'Comet - you had a breakthrough!';
    case 'orions_belt':
      return "Orion's Belt - 5 in a row without help!";
    case 'deep_diver':
      return 'Deep Diver - great thoughtful responses';
    case 'persistent':
      return 'Persistent - you kept going after a correction';
    case 'topic_mastered':
      return 'Comet - topic mastered';
    case 'evaluate_success':
      return 'Twin Stars - you spotted the flaw';
    case 'teach_back_success':
      return 'Twin Stars - you taught it clearly';
    case 'streak_7':
      return 'Comet - 7 day streak';
    case 'streak_30':
      return "Orion's Belt - 30 day streak";
    case 'curriculum_complete':
      return 'Comet - curriculum complete';
    default:
      return reason;
  }
}

export interface MilestoneTrackerState {
  consecutiveLowRung: number;
  longMessageCount: number;
  awaitingPersistence: boolean;
  previousRung: number | null;
  milestonesReached: CelebrationReason[];
}

export const INITIAL_MILESTONE_TRACKER_STATE: MilestoneTrackerState = {
  consecutiveLowRung: 0,
  longMessageCount: 0,
  awaitingPersistence: false,
  previousRung: null,
  milestonesReached: [],
};

export function normalizeMilestoneTrackerState(
  value: unknown,
): MilestoneTrackerState {
  const raw = value as Partial<MilestoneTrackerState> | null | undefined;
  const milestonesReached = Array.isArray(raw?.milestonesReached)
    ? raw.milestonesReached.filter(
        (reason): reason is CelebrationReason => typeof reason === 'string',
      )
    : [];

  return {
    consecutiveLowRung:
      typeof raw?.consecutiveLowRung === 'number' ? raw.consecutiveLowRung : 0,
    longMessageCount:
      typeof raw?.longMessageCount === 'number' ? raw.longMessageCount : 0,
    awaitingPersistence:
      typeof raw?.awaitingPersistence === 'boolean'
        ? raw.awaitingPersistence
        : false,
    previousRung:
      typeof raw?.previousRung === 'number' ? raw.previousRung : null,
    milestonesReached,
  };
}

export function createMilestoneTrackerStateFromMilestones(
  milestonesReached: CelebrationReason[],
): MilestoneTrackerState {
  return {
    ...INITIAL_MILESTONE_TRACKER_STATE,
    milestonesReached: Array.from(new Set(milestonesReached)),
  };
}

export function advanceMilestoneTracker(
  currentState: MilestoneTrackerState,
  input: {
    userMessage: string;
    escalationRung: number;
  },
): {
  triggered: CelebrationReason[];
  trackerState: MilestoneTrackerState;
} {
  const triggered: CelebrationReason[] = [];
  const reached = new Set(currentState.milestonesReached);
  const longMessageCount =
    currentState.longMessageCount +
    (input.userMessage.trim().length > 50 ? 1 : 0);

  const isLowRung = input.escalationRung <= 2;
  const consecutiveLowRung = isLowRung
    ? currentState.consecutiveLowRung + 1
    : 0;

  if (isLowRung && !reached.has('polar_star')) {
    triggered.push('polar_star');
    reached.add('polar_star');
  }

  if (consecutiveLowRung >= 3 && !reached.has('twin_stars')) {
    triggered.push('twin_stars');
    reached.add('twin_stars');
  }

  if (
    currentState.previousRung != null &&
    currentState.previousRung >= 3 &&
    isLowRung &&
    !reached.has('comet')
  ) {
    triggered.push('comet');
    reached.add('comet');
  }

  if (consecutiveLowRung >= 5 && !reached.has('orions_belt')) {
    triggered.push('orions_belt');
    reached.add('orions_belt');
  }

  if (longMessageCount >= 3 && !reached.has('deep_diver')) {
    triggered.push('deep_diver');
    reached.add('deep_diver');
  }

  if (currentState.awaitingPersistence && !reached.has('persistent')) {
    triggered.push('persistent');
    reached.add('persistent');
  }

  return {
    triggered,
    trackerState: {
      consecutiveLowRung,
      longMessageCount,
      awaitingPersistence: input.escalationRung >= 4,
      previousRung: input.escalationRung,
      milestonesReached: Array.from(reached),
    },
  };
}

export function useMilestoneTracker() {
  const [state, setState] = useState<MilestoneTrackerState>(
    INITIAL_MILESTONE_TRACKER_STATE,
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const trackExchange = useCallback(
    (input: { userMessage: string; escalationRung: number }) => {
      const result = advanceMilestoneTracker(stateRef.current, input);
      stateRef.current = result.trackerState;
      setState(result.trackerState);
      return result;
    },
    [],
  );

  const reset = useCallback(() => {
    stateRef.current = INITIAL_MILESTONE_TRACKER_STATE;
    setState(INITIAL_MILESTONE_TRACKER_STATE);
  }, []);

  const hydrate = useCallback((nextState: MilestoneTrackerState) => {
    const normalized = normalizeMilestoneTrackerState(nextState);
    stateRef.current = normalized;
    setState(normalized);
  }, []);

  return {
    milestonesReached: state.milestonesReached,
    trackerState: state,
    trackExchange,
    hydrate,
    reset,
  };
}
