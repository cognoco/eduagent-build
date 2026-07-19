import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  AccommodationMode,
  CelebrationLevel,
  CelebrationName,
  CelebrationReason,
  PendingCelebration,
} from '@eduagent/schemas';
import { Comet, OrionsBelt, PolarStar, TwinStars } from '../components/common';
import { resolveCelebrationLevelForAccommodation } from '../lib/celebration-level';

type QueueEntry = PendingCelebration;
type ProfileDeliveryState = {
  profileId: string | null;
  activeEntry: QueueEntry | null;
  pendingQueue: QueueEntry[];
  generation: number;
  completedGeneration: number;
};

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
  t: TFunction,
  reason: CelebrationReason,
  audience: 'child' | 'adult',
): string {
  switch (reason) {
    case 'polar_star':
      return audience === 'child'
        ? t('celebrationEarnedContext.polar_star.child')
        : t('celebrationEarnedContext.polar_star.adult');
    case 'twin_stars':
      return audience === 'child'
        ? t('celebrationEarnedContext.twin_stars.child')
        : t('celebrationEarnedContext.twin_stars.adult');
    case 'comet':
      return audience === 'child'
        ? t('celebrationEarnedContext.comet.child')
        : t('celebrationEarnedContext.comet.adult');
    case 'orions_belt':
      return audience === 'child'
        ? t('celebrationEarnedContext.orions_belt.child')
        : t('celebrationEarnedContext.orions_belt.adult');
    case 'deep_diver':
      return audience === 'child'
        ? t('celebrationEarnedContext.deep_diver.child')
        : t('celebrationEarnedContext.deep_diver.adult');
    case 'persistent':
      return audience === 'child'
        ? t('celebrationEarnedContext.persistent.child')
        : t('celebrationEarnedContext.persistent.adult');
    case 'topic_mastered':
      return audience === 'child'
        ? t('celebrationEarnedContext.topic_mastered.child')
        : t('celebrationEarnedContext.topic_mastered.adult');
    case 'evaluate_success':
      return audience === 'child'
        ? t('celebrationEarnedContext.evaluate_success.child')
        : t('celebrationEarnedContext.evaluate_success.adult');
    case 'teach_back_success':
      return audience === 'child'
        ? t('celebrationEarnedContext.teach_back_success.child')
        : t('celebrationEarnedContext.teach_back_success.adult');
    case 'streak_7':
      return audience === 'child'
        ? t('celebrationEarnedContext.streak_7.child')
        : t('celebrationEarnedContext.streak_7.adult');
    case 'streak_30':
      return audience === 'child'
        ? t('celebrationEarnedContext.streak_30.child')
        : t('celebrationEarnedContext.streak_30.adult');
    case 'curriculum_complete':
      return audience === 'child'
        ? t('celebrationEarnedContext.curriculum_complete.child')
        : t('celebrationEarnedContext.curriculum_complete.adult');
    default:
      return audience === 'child'
        ? t('celebrationEarnedContext.default.child')
        : t('celebrationEarnedContext.default.adult');
  }
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
  onAllComplete?: (profileId: string | null) => void;
}) {
  const { t } = useTranslation();
  const celebrationLevel = resolveCelebrationLevelForAccommodation(
    options?.accommodationMode,
    options?.celebrationLevel ?? 'all',
  );
  const [deliveryByProfile, setDeliveryByProfile] = useState<
    Map<string, ProfileDeliveryState>
  >(new Map());
  const seenQueueKeysByProfileRef = useRef<Map<string, Set<string>>>(new Map());
  const notifiedGenerationByProfileRef = useRef<Map<string, number>>(new Map());
  const profileId = options?.profileId ?? null;
  const profileKey = profileId ?? '__default__';
  const activeDelivery = deliveryByProfile.get(profileKey);
  const activeEntry = activeDelivery?.activeEntry ?? null;
  const audience = options?.audience ?? 'child';

  // Keep completion callbacks current without coupling them to queue state.
  // Assign during render so a completion effect always sees the latest caller.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!options?.queue || options.queue.length === 0) return;
    let seenQueueKeys = seenQueueKeysByProfileRef.current.get(profileKey);
    if (!seenQueueKeys) {
      seenQueueKeys = new Set();
      seenQueueKeysByProfileRef.current.set(profileKey, seenQueueKeys);
    }
    const admissionKeys = new Set(seenQueueKeys);
    const unseen: QueueEntry[] = [];
    for (const entry of options.queue) {
      const key = getQueueEntryKey(entry);
      if (admissionKeys.has(key) || !filterByLevel(entry, celebrationLevel)) {
        continue;
      }
      admissionKeys.add(key);
      unseen.push(entry);
    }

    const firstUnseen = unseen[0];
    if (!firstUnseen) return;

    seenQueueKeysByProfileRef.current.set(profileKey, admissionKeys);
    const remainingUnseen = unseen.slice(1);

    setDeliveryByProfile((current) => {
      const next = new Map(current);
      const existing = next.get(profileKey) ?? {
        profileId,
        activeEntry: null,
        pendingQueue: [],
        generation: 0,
        completedGeneration: 0,
      };
      const isIdle =
        existing.activeEntry === null && existing.pendingQueue.length === 0;
      next.set(profileKey, {
        ...existing,
        profileId,
        activeEntry: isIdle ? firstUnseen : existing.activeEntry,
        pendingQueue: isIdle
          ? remainingUnseen
          : [...existing.pendingQueue, ...unseen],
        generation: isIdle ? existing.generation + 1 : existing.generation,
      });
      return next;
    });
  }, [celebrationLevel, options?.queue, profileId, profileKey]);

  useEffect(() => {
    const delivery = deliveryByProfile.get(profileKey);
    if (!delivery) return;
    const notifiedGeneration =
      notifiedGenerationByProfileRef.current.get(profileKey) ?? 0;
    if (delivery.completedGeneration <= notifiedGeneration) return;
    notifiedGenerationByProfileRef.current.set(
      profileKey,
      delivery.completedGeneration,
    );
    optionsRef.current?.onAllComplete?.(delivery.profileId);
  }, [deliveryByProfile, profileKey]);

  const completeActiveEntry = useCallback(
    (ownerKey: string, entryKey: string) => {
      setDeliveryByProfile((current) => {
        const existing = current.get(ownerKey);
        if (
          !existing?.activeEntry ||
          getQueueEntryKey(existing.activeEntry) !== entryKey
        ) {
          return current;
        }
        const [nextEntry, ...remaining] = existing.pendingQueue;
        const next = new Map(current);
        next.set(ownerKey, {
          ...existing,
          activeEntry: nextEntry ?? null,
          pendingQueue: remaining,
          completedGeneration: nextEntry
            ? existing.completedGeneration
            : existing.generation,
        });
        return next;
      });
    },
    [],
  );

  const trigger = useCallback(
    (entry: Omit<QueueEntry, 'queuedAt'>) => {
      const nextEntry: QueueEntry = {
        ...entry,
        queuedAt: new Date().toISOString(),
      };
      if (!filterByLevel(nextEntry, celebrationLevel)) {
        return;
      }
      setDeliveryByProfile((current) => {
        const next = new Map(current);
        const existing = next.get(profileKey) ?? {
          profileId,
          activeEntry: null,
          pendingQueue: [],
          generation: 0,
          completedGeneration: 0,
        };
        const isIdle =
          existing.activeEntry === null && existing.pendingQueue.length === 0;
        next.set(profileKey, {
          ...existing,
          activeEntry: isIdle ? nextEntry : existing.activeEntry,
          pendingQueue: isIdle
            ? existing.pendingQueue
            : [...existing.pendingQueue, nextEntry],
          generation: isIdle ? existing.generation + 1 : existing.generation,
        });
        return next;
      });
    },
    [celebrationLevel, profileId, profileKey],
  );

  const CelebrationOverlay = useMemo(() => {
    if (!activeEntry) return null;
    const Component = CELEBRATION_REGISTRY[activeEntry.celebration].Component;
    const activeEntryKey = getQueueEntryKey(activeEntry);

    return (
      <View
        style={{ pointerEvents: 'none' }}
        className="absolute top-24 left-0 right-0 items-center z-50"
      >
        <Component
          key={`${profileKey}:${activeEntryKey}`}
          onComplete={() => {
            completeActiveEntry(profileKey, activeEntryKey);
          }}
        />
        <View className="mt-2 bg-surface/95 rounded-full px-4 py-2">
          <Text className="text-body-sm font-semibold text-text-primary">
            {getCelebrationMessage(t, activeEntry.reason, audience)}
          </Text>
          {activeEntry.detail ? (
            <Text className="text-caption text-text-secondary text-center mt-1">
              {activeEntry.detail}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }, [activeEntry, audience, completeActiveEntry, profileKey, t]);

  return {
    CelebrationOverlay,
    trigger,
    registry: CELEBRATION_REGISTRY,
  };
}
