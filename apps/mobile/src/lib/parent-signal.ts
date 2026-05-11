import type { Ionicons } from '@expo/vector-icons';
import type { RetentionStatus } from '@eduagent/schemas';

export type AggregateSignal = 'on-track' | 'needs-attention' | 'falling-behind';

export interface AggregateSignalConfig {
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: 'retentionStrong' | 'retentionFading' | 'retentionWeak';
  textColorClass: string;
}

export const AGGREGATE_SIGNAL_CONFIG: Record<
  AggregateSignal,
  AggregateSignalConfig
> = {
  'on-track': {
    icon: 'leaf',
    colorKey: 'retentionStrong',
    textColorClass: 'text-retention-strong',
  },
  'needs-attention': {
    icon: 'flame',
    colorKey: 'retentionFading',
    textColorClass: 'text-retention-fading',
  },
  'falling-behind': {
    icon: 'sparkles',
    colorKey: 'retentionWeak',
    textColorClass: 'text-retention-weak',
  },
};

export function deriveAggregateSignal(
  retentionStatuses: ReadonlyArray<RetentionStatus>,
): AggregateSignal | null {
  if (retentionStatuses.length === 0) return null;
  if (retentionStatuses.some((s) => s === 'weak' || s === 'forgotten')) {
    return 'falling-behind';
  }
  if (retentionStatuses.some((s) => s === 'fading')) {
    return 'needs-attention';
  }
  return 'on-track';
}
