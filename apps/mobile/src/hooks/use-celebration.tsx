import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import type { ReactElement } from 'react';
import type {
  CelebrationLevel,
  CelebrationName,
  CelebrationReason,
  PendingCelebration,
} from '@eduagent/schemas';
import { Comet, OrionsBelt, PolarStar, TwinStars } from '../components/common';

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

function getCelebrationMessage(
  reason: CelebrationReason,
  audience: 'child' | 'adult'
): string {
  if (reason === 'comet' || reason === 'topic_mastered') {
    return audience === 'child'
      ? 'You had a breakthrough!'
      : 'Breakthrough - concept clicked.';
  }

  if (reason === 'orions_belt' || reason === 'streak_30') {
    return audience === 'child'
      ? 'That was a huge milestone!'
      : 'Major milestone reached.';
  }

  if (reason === 'deep_diver') {
    return 'Great thoughtful responses';
  }

  if (reason === 'persistent') {
    return 'You kept going';
  }

  return audience === 'child' ? 'Nice work!' : 'Nice work.';
}

function filterByLevel(
  entry: QueueEntry,
  celebrationLevel: CelebrationLevel
): boolean {
  if (celebrationLevel === 'off') return false;
  if (celebrationLevel === 'big_only') {
    return CELEBRATION_REGISTRY[entry.celebration].tier >= 3;
  }
  return true;
}

export function useCelebration(options?: {
  queue?: QueueEntry[];
  celebrationLevel?: CelebrationLevel;
  audience?: 'child' | 'adult';
  onAllComplete?: () => void;
}) {
  const celebrationLevel = options?.celebrationLevel ?? 'all';
  const audience = options?.audience ?? 'child';
  const [activeEntry, setActiveEntry] = useState<QueueEntry | null>(null);
  const [pendingQueue, setPendingQueue] = useState<QueueEntry[]>([]);
  const seenQueueKeysRef = useRef<Set<string>>(new Set());
  const shownFromCurrentBatchRef = useRef(0);
  const lastBatchIdRef = useRef<string | null>(null);

  const flushNext = useCallback(() => {
    setPendingQueue((current) => {
      const [next, ...rest] = current;
      setActiveEntry(next ?? null);
      if (!next) {
        options?.onAllComplete?.();
      }
      return rest;
    });
  }, [options]);

  useEffect(() => {
    if (!options?.queue || options.queue.length === 0) return;

    // Batch identity: the max queuedAt across all entries. A fresh session
    // completion produces newer timestamps than the previous batch.
    const batchId =
      options.queue
        .map((e) => e.queuedAt)
        .sort()
        .slice(-1)[0] ?? null;

    // New batch — reset the per-batch cap counter
    if (batchId !== lastBatchIdRef.current) {
      shownFromCurrentBatchRef.current = 0;
      lastBatchIdRef.current = batchId;
    }

    const unseen = options.queue.filter((entry) => {
      const key = `${entry.celebration}:${entry.reason}:${entry.detail ?? ''}:${
        entry.queuedAt
      }`;
      if (seenQueueKeysRef.current.has(key)) {
        return false;
      }
      seenQueueKeysRef.current.add(key);
      return filterByLevel(entry, celebrationLevel);
    });

    if (unseen.length === 0) return;

    // Throttle: at most 2 celebrations per batch
    const MAX_TOASTS_PER_BATCH = 2;
    const remaining = MAX_TOASTS_PER_BATCH - shownFromCurrentBatchRef.current;
    const toShow = unseen.slice(0, Math.max(0, remaining));

    if (toShow.length === 0) return;

    shownFromCurrentBatchRef.current += toShow.length;

    setPendingQueue((current) => [...current, ...toShow]);
  }, [celebrationLevel, options?.queue]);

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
    [celebrationLevel]
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
            {getCelebrationMessage(activeEntry.reason, audience)}
          </Text>
          {activeEntry.detail ? (
            <Text className="text-caption text-text-secondary text-center mt-1">
              {activeEntry.detail}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }, [activeEntry, audience]);

  return {
    CelebrationOverlay,
    trigger,
    registry: CELEBRATION_REGISTRY,
  };
}
