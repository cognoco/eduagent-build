import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type {
  LearningStyle,
  MemorySource,
  StruggleEntry,
} from '@eduagent/schemas';

// Shared helpers used by both the child-facing and parent-facing mentor
// memory screens. Extracted here to keep both screens in sync.

export type LearningStyleRow = {
  key: string;
  label: string;
  source: NonNullable<LearningStyle>['source'];
};

export function getLearningStyleRows(style: LearningStyle): LearningStyleRow[] {
  if (!style) return [];

  const rows: LearningStyleRow[] = [];

  if (style.preferredExplanations?.length) {
    rows.push({
      key: 'preferredExplanations',
      label: `Prefers ${style.preferredExplanations.join(', ')} explanations`,
      source: style.source,
    });
  }

  if (style.pacePreference) {
    rows.push({
      key: 'pacePreference',
      label:
        style.pacePreference === 'thorough'
          ? 'Prefers a step-by-step pace'
          : 'Prefers a quicker pace',
      source: style.source,
    });
  }

  if (style.responseToChallenge) {
    rows.push({
      key: 'responseToChallenge',
      label:
        style.responseToChallenge === 'motivated'
          ? 'Likes a challenge'
          : 'Needs extra encouragement when work gets difficult',
      source: style.source,
    });
  }

  return rows;
}

export function getStruggleProgress(entry: StruggleEntry): {
  progressLabel: string;
  progressValue: number;
} {
  const attemptsLabel = `${entry.attempts} ${
    entry.attempts === 1 ? 'time' : 'times'
  } noticed`;
  const confidenceLabel =
    entry.confidence === 'high'
      ? 'Showing up a lot lately'
      : entry.confidence === 'medium'
      ? 'Repeated pattern'
      : 'Early signal';

  return {
    progressLabel: `${confidenceLabel} - ${attemptsLabel}`,
    progressValue: Math.min(entry.attempts / 5, 1),
  };
}

export function MemorySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="mt-6">
      <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function CollapsibleMemorySection({
  title,
  children,
  defaultExpanded = false,
}: {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View className="mt-6">
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        className="flex-row items-center justify-between mb-2"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
      >
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider">
          {title}
        </Text>
        <Text className="text-caption font-semibold text-primary">
          {expanded ? 'Hide' : 'Show'}
        </Text>
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}

function getSourceBadgeLabel(source?: MemorySource): string | null {
  if (source === 'learner') return 'You told your mentor';
  if (source === 'parent') return 'Added by parent';
  return null;
}

export function MemorySourceBadge({ source }: { source?: MemorySource }) {
  const label = getSourceBadgeLabel(source);
  if (!label) return null;

  return (
    <View className="self-start rounded-full bg-primary/10 px-3 py-1 mt-2">
      <Text className="text-caption font-semibold text-primary">{label}</Text>
    </View>
  );
}

export function MemoryRow({
  label,
  detail,
  source,
  progressLabel,
  progressValue,
  onRemove,
  actionLabel = 'Remove',
}: {
  label: string;
  detail?: string;
  source?: MemorySource;
  progressLabel?: string;
  progressValue?: number;
  onRemove?: () => void;
  actionLabel?: string;
}) {
  const clampedProgress =
    progressValue == null
      ? undefined
      : Math.max(0.12, Math.min(1, progressValue));

  return (
    <View className="bg-surface rounded-card px-4 py-3 mb-2">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pe-3">
          <Text className="text-body text-text-primary">{label}</Text>
          {detail ? (
            <Text className="text-caption text-text-secondary mt-1">
              {detail}
            </Text>
          ) : null}
          <MemorySourceBadge source={source} />
        </View>
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            className="px-3 py-2"
            accessibilityRole="button"
          >
            <Text className="text-body-sm font-semibold text-danger">
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {clampedProgress != null ? (
        <View className="mt-3">
          {progressLabel ? (
            <Text className="text-caption text-text-secondary mb-1.5">
              {progressLabel}
            </Text>
          ) : null}
          <View className="h-2 bg-border rounded-full overflow-hidden">
            <View
              className="h-2 bg-primary rounded-full"
              style={{ width: `${Math.round(clampedProgress * 100)}%` }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
