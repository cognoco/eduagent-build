import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import type { ReactElement } from 'react';
import type {
  AccommodationMode,
  CelebrationLevel,
  CelebrationName,
  CelebrationReason,
  PendingCelebration,
} from '@eduagent/schemas';
import { Comet, OrionsBelt, PolarStar, TwinStars } from '../components/common';
import { resolveCelebrationLevelForAccommodation } from '../lib/celebration-level';
import { getMilestoneLabel } from './use-milestone-tracker';

type QueueEntry = PendingCelebration;

const CELEBRATION_REGISTRY: Record<
  CelebrationName,
  {
    tier: 1 | 2 | 3 | 4;
    Component: ({
      onComplete,
      testID,
    }: {
      onComplete?: () => void;
      testID?: string;
    }) => ReactElement;
  }
> = {
  polar_star: { tier: 1, Component: PolarStar },
  twin_stars: { tier: 2, Component: TwinStars },
  comet: { tier: 3, Component: Comet },
  orions_belt: { tier: 4, Component: OrionsBelt },
};

function getCelebrationMessage(reason: CelebrationReason): string {
  return getMilestoneLabel(reason);
}

function filterByLevel(
  entry: QueueEntry,
  celebrationLevel: CelebrationLevel,
): boolean {
  if (celebrationLevel === 'off') return false;
  if (celebrationLevel === 'big_only') {
    return CELEBRATION_REGISTRY[entry.celebration].tier >= 3;
  }
  return true;
}

function getQueueEntryKey(entry: QueueEntry): string {
  return `${entry.celebration}:${entry.reason}:${entry.detail ?? ''}:${
    entry.queuedAt
  }`;
}

export function useCelebration(options?: {
  queue?: QueueEntry[];
  profileId?: string | null;
  celebrationLevel?: CelebrationLevel;
  accommodationMode?: AccommodationMode;
  audience?: 'child' | 'adult';
  onAllComplete?: () => void;
}) {
  const celebrationLevel = resolveCelebrationLevelForAccommodation(
    options?.accommodationMode,
    options?.celebrationLevel ?? 'all',
  );
  const [activeEntry, setActiveEntry] = useState<QueueEntry | null>(null);
  const [pendingQueue, setPendingQueue] = useState<QueueEntry[]>([]);
  const seenQueueKeysByProfileRef = useRef<Map<string, Set<string>>>(new Map());
  const profileKey = options?.profileId ?? '__default__';

  // Keep a ref to the latest options so callbacks (e.g. onAllComplete) are
  // always current without re-creating flushNext on every render.
  // Assign during render (not in a post-render effect) so the ref is
  // immediately up-to-date if flushNext fires synchronously in the same cycle.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const flushNext = useCallback(() => {
    setPendingQueue((current) => {
      const [next, ...rest] = current;
      setActiveEntry(next ?? null);
      if (!next) {
        optionsRef.current?.onAllComplete?.();
      }
      return rest;
    });
  }, []);

  useEffect(() => {
    if (!options?.queue || options.queue.length === 0) return;
    let seenQueueKeys = seenQueueKeysByProfileRef.current.get(profileKey);
    if (!seenQueueKeys) {
      seenQueueKeys = new Set();
      seenQueueKeysByProfileRef.current.set(profileKey, seenQueueKeys);
    }
    const unseen = options.queue
      .map((entry) => ({ entry, key: getQueueEntryKey(entry) }))
      .filter(
        ({ entry, key }) =>
          !seenQueueKeys.has(key) && filterByLevel(entry, celebrationLevel),
      );

    if (unseen.length === 0) return;

    for (const { key } of unseen) {
      seenQueueKeys.add(key);
    }

    setPendingQueue((current) => [
      ...current,
      ...unseen.map(({ entry }) => entry),
    ]);
  }, [celebrationLevel, options?.queue, profileKey]);

  useEffect(() => {
    if (!activeEntry && pendingQueue.length > 0) {
      flushNext();
    }
  }, [activeEntry, flushNext, pendingQueue.length]);

  const trigger = useCallback(
    (entry: Omit<QueueEntry, 'queuedAt'>) => {
      const nextEntry: QueueEntry = {
        ...entry,
        queuedAt: new Date().toISOString(),
      };
      if (!filterByLevel(nextEntry, celebrationLevel)) {
        return;
      }
      setPendingQueue((current) => [...current, nextEntry]);
    },
    [celebrationLevel],
  );

  const CelebrationOverlay = useMemo(() => {
    if (!activeEntry) return null;
    const Component = CELEBRATION_REGISTRY[activeEntry.celebration].Component;

    return (
      <View
        style={{ pointerEvents: 'none' }}
        className="absolute top-24 left-0 right-0 items-center z-50"
      >
        <Component
          onComplete={() => {
            setActiveEntry(null);
          }}
        />
        <View className="mt-2 bg-surface/95 rounded-full px-4 py-2">
          <Text className="text-body-sm font-semibold text-text-primary">
            {getCelebrationMessage(activeEntry.reason)}
          </Text>
          {activeEntry.detail ? (
            <Text className="text-caption text-text-secondary text-center mt-1">
              {activeEntry.detail}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }, [activeEntry]);

  return {
    CelebrationOverlay,
    trigger,
    registry: CELEBRATION_REGISTRY,
  };
}
