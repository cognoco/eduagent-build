import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  readSessionRecoveryMarker,
  writeSessionRecoveryMarker,
} from '../../../../lib/session-recovery';
import type { CelebrationReason } from '@eduagent/schemas';
import {
  createMilestoneTrackerStateFromMilestones,
  normalizeMilestoneTrackerState,
  type MilestoneTrackerState,
} from '../../../../hooks/use-milestone-tracker';

/**
 * Bridges the session screen to the SecureStore recovery marker:
 *
 *  - on resume (routeSessionId set), hydrate milestoneTracker from either
 *    the marker (preferred — most recent) or the transcript fallback;
 *  - while the screen is active, write the marker every time the app moves
 *    to background/inactive so an OS-evicted process can resume cleanly.
 *
 * The marker is keyed by profileId so two profiles on one device don't
 * pollute each other.
 */
export function useSessionRecovery({
  activeProfileId,
  activeSessionId,
  routeSessionId,
  effectiveMode,
  effectiveSubjectId,
  effectiveSubjectName,
  topicId,
  topicName,
  trackerState,
  liveTranscriptMilestones,
  hydrate,
  hasHydratedRecoveryRef,
}: {
  activeProfileId: string | undefined;
  activeSessionId: string | null;
  routeSessionId: string | undefined;
  effectiveMode: string;
  effectiveSubjectId: string;
  effectiveSubjectName: string | undefined;
  topicId: string | undefined;
  topicName: string | undefined;
  trackerState: MilestoneTrackerState;
  liveTranscriptMilestones: readonly CelebrationReason[] | undefined;
  hydrate: (state: MilestoneTrackerState) => void;
  hasHydratedRecoveryRef: React.MutableRefObject<boolean>;
}): void {
  useEffect(() => {
    if (!routeSessionId || hasHydratedRecoveryRef.current) return;

    let cancelled = false;

    void (async () => {
      try {
        const marker = await readSessionRecoveryMarker(activeProfileId);
        if (cancelled || hasHydratedRecoveryRef.current) return;

        if (marker?.sessionId === routeSessionId && marker.milestoneTracker) {
          hydrate(normalizeMilestoneTrackerState(marker.milestoneTracker));
          hasHydratedRecoveryRef.current = true;
          return;
        }

        const transcriptMilestones = liveTranscriptMilestones
          ? [...liveTranscriptMilestones]
          : ([] as CelebrationReason[]);
        if (transcriptMilestones.length > 0) {
          hydrate(
            createMilestoneTrackerStateFromMilestones(transcriptMilestones),
          );
          hasHydratedRecoveryRef.current = true;
        }
      } catch {
        /* SecureStore unavailable — skip recovery hydration */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeProfileId,
    hasHydratedRecoveryRef,
    hydrate,
    routeSessionId,
    liveTranscriptMilestones,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        (nextState === 'background' || nextState === 'inactive') &&
        activeSessionId
      ) {
        void writeSessionRecoveryMarker(
          {
            sessionId: activeSessionId,
            profileId: activeProfileId ?? undefined,
            subjectId: effectiveSubjectId || undefined,
            subjectName: effectiveSubjectName || undefined,
            topicId: topicId ?? undefined,
            topicName: topicName ?? undefined,
            mode: effectiveMode,
            milestoneTracker: trackerState,
            updatedAt: new Date().toISOString(),
          },
          activeProfileId,
        ).catch(() => undefined);
      }
    });

    return () => subscription.remove();
  }, [
    activeSessionId,
    activeProfileId,
    effectiveMode,
    effectiveSubjectId,
    effectiveSubjectName,
    trackerState,
    topicId,
    topicName,
  ]);
}
