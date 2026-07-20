import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as ExpoSecureStore from 'expo-secure-store';
import { AppState, type AppStateStatus } from 'react-native';

import {
  INITIAL_MILESTONE_TRACKER_STATE,
  type MilestoneTrackerState,
} from '../../../../hooks/use-milestone-tracker';
import { writeSessionRecoveryMarker } from '../../../../lib/session-recovery';
import { useSessionRecovery } from './use-session-recovery';

const secureStore = jest.mocked(ExpoSecureStore);

type AppStateListener = (nextState: AppStateStatus) => void;

const trackerState: MilestoneTrackerState = {
  ...INITIAL_MILESTONE_TRACKER_STATE,
  consecutiveLowRung: 2,
  longMessageCount: 1,
  awaitingPersistence: true,
  previousRung: 4,
  milestonesReached: ['polar_star'],
};

function renderRecoveryHook(
  overrides: Partial<Parameters<typeof useSessionRecovery>[0]> = {},
) {
  const hydrate = jest.fn();
  const hasHydratedRecoveryRef = { current: false };
  const cancelSilencePrompt = jest.fn();

  const result = renderHook(() =>
    useSessionRecovery({
      activeProfileId: 'profile-1',
      activeSessionId: 'session-1',
      routeSessionId: 'session-1',
      effectiveMode: 'learning',
      effectiveSubjectId: 'subject-1',
      effectiveSubjectName: 'Physics',
      topicId: 'topic-1',
      topicName: 'Velocity',
      trackerState,
      liveTranscriptMilestones: undefined,
      hydrate,
      hasHydratedRecoveryRef,
      cancelSilencePrompt,
      ...overrides,
    }),
  );

  return {
    ...result,
    hydrate,
    hasHydratedRecoveryRef,
    cancelSilencePrompt,
  };
}

describe('useSessionRecovery', () => {
  let appStateListener: AppStateListener | null = null;
  let removeAppStateListener: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = null;
    removeAppStateListener = jest.fn();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_eventName, listener) => {
        appStateListener = listener as AppStateListener;
        return { remove: removeAppStateListener };
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the profile-scoped SecureStore marker and hydrates matching-session milestone state', async () => {
    await writeSessionRecoveryMarker(
      {
        sessionId: 'session-1',
        profileId: 'profile-1',
        milestoneTracker: {
          consecutiveLowRung: 3,
          longMessageCount: 2,
          awaitingPersistence: false,
          previousRung: 2,
          milestonesReached: ['polar_star', 'comet'],
        },
        updatedAt: '2026-07-06T12:00:00.000Z',
      },
      'profile-1',
    );
    secureStore.getItemAsync.mockClear();

    const { hydrate, hasHydratedRecoveryRef } = renderRecoveryHook();

    await waitFor(() => {
      expect(secureStore.getItemAsync).toHaveBeenCalledWith(
        'session-recovery-marker-profile-1',
      );
      expect(hydrate).toHaveBeenCalledWith({
        consecutiveLowRung: 3,
        longMessageCount: 2,
        awaitingPersistence: false,
        previousRung: 2,
        milestonesReached: ['polar_star', 'comet'],
      });
    });
    expect(hasHydratedRecoveryRef.current).toBe(true);
  });

  it('uses transcript milestones when the marker belongs to a different session', async () => {
    await writeSessionRecoveryMarker(
      {
        sessionId: 'other-session',
        profileId: 'profile-1',
        milestoneTracker: {
          ...INITIAL_MILESTONE_TRACKER_STATE,
          milestonesReached: ['deep_diver'],
        },
        updatedAt: '2026-07-06T12:00:00.000Z',
      },
      'profile-1',
    );
    secureStore.getItemAsync.mockClear();

    const { hydrate } = renderRecoveryHook({
      liveTranscriptMilestones: ['polar_star', 'comet'],
    });

    await waitFor(() => {
      expect(secureStore.getItemAsync).toHaveBeenCalledWith(
        'session-recovery-marker-profile-1',
      );
      expect(hydrate).toHaveBeenCalledWith({
        ...INITIAL_MILESTONE_TRACKER_STATE,
        milestonesReached: ['polar_star', 'comet'],
      });
    });
  });

  it('does not hydrate from a nonmatching marker when no transcript milestones exist', async () => {
    await writeSessionRecoveryMarker(
      {
        sessionId: 'other-session',
        profileId: 'profile-1',
        milestoneTracker: {
          ...INITIAL_MILESTONE_TRACKER_STATE,
          milestonesReached: ['deep_diver'],
        },
        updatedAt: '2026-07-06T12:00:00.000Z',
      },
      'profile-1',
    );
    secureStore.getItemAsync.mockClear();

    const { hydrate } = renderRecoveryHook();

    await waitFor(() => {
      expect(secureStore.getItemAsync).toHaveBeenCalledWith(
        'session-recovery-marker-profile-1',
      );
    });
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('writes the current session marker when AppState moves to background', async () => {
    renderRecoveryHook();

    expect(appStateListener).not.toBeNull();
    act(() => {
      appStateListener?.('background');
    });

    await waitFor(() => {
      expect(secureStore.setItemAsync).toHaveBeenCalledWith(
        'session-recovery-marker-profile-1',
        expect.any(String),
      );
    });

    const [, rawMarker] = secureStore.setItemAsync.mock.calls.at(-1) ?? [];
    expect(JSON.parse(String(rawMarker))).toEqual({
      sessionId: 'session-1',
      profileId: 'profile-1',
      subjectId: 'subject-1',
      subjectName: 'Physics',
      topicId: 'topic-1',
      topicName: 'Velocity',
      mode: 'learning',
      milestoneTracker: trackerState,
      updatedAt: expect.any(String),
    });
  });

  it('[WI-2103 AC-3] cancels the active silence timer across background end and foreground return', () => {
    jest.useFakeTimers();
    const latePrompt = jest.fn();
    const timerRef: {
      current: ReturnType<typeof setTimeout> | null;
    } = {
      current: setTimeout(latePrompt, 2 * 60 * 1000) as unknown as ReturnType<
        typeof setTimeout
      >,
    };
    const cancelSilencePrompt = jest.fn(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    });

    try {
      renderRecoveryHook({ cancelSilencePrompt });

      act(() => {
        appStateListener?.('background');
        appStateListener?.('active');
        jest.advanceTimersByTime(2 * 60 * 1000 + 1);
      });

      expect(cancelSilencePrompt).toHaveBeenCalled();
      expect(latePrompt).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('silently skips recovery when SecureStore marker read fails', async () => {
    secureStore.getItemAsync.mockRejectedValueOnce(
      new Error('SecureStore unavailable'),
    );

    const { hydrate } = renderRecoveryHook();

    await waitFor(() => {
      expect(secureStore.getItemAsync).toHaveBeenCalledWith(
        'session-recovery-marker-profile-1',
      );
    });
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('silently ignores SecureStore marker write failures on background', async () => {
    secureStore.setItemAsync.mockRejectedValueOnce(
      new Error('SecureStore write failed'),
    );

    renderRecoveryHook();

    act(() => {
      appStateListener?.('background');
    });

    await waitFor(() => {
      expect(secureStore.setItemAsync).toHaveBeenCalledWith(
        'session-recovery-marker-profile-1',
        expect.any(String),
      );
    });
  });
});
