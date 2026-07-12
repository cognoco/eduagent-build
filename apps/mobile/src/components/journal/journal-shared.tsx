import React from 'react';
import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { BookPageFlipAnimation } from '../common/BookPageFlipAnimation';
import { DeskLampAnimation } from '../common/DeskLampAnimation';
import { MagicPenAnimation } from '../common/MagicPenAnimation';
import { classifyApiError, recoveryActions } from '../../lib/format-api-error';

export type JournalSectionId =
  | 'notes'
  | 'sessions'
  | 'practice'
  | 'memory'
  | 'reports';

/**
 * Builds the {primary, secondary} ErrorFallback action pair from a RAW error.
 * Classifies the raw error first (never string-matches formatted output), then
 * maps recovery to retry-primary / go-home-secondary per the UX Resilience
 * rules (AGENTS.md). Screens never parse HTTP status codes.
 */
export function useSectionErrorActions(
  error: unknown,
  onRetry: () => void,
): {
  primary?: { label: string; onPress: () => void; testID: string };
  secondary?: { label: string; onPress: () => void; testID: string };
} {
  const router = useRouter();
  const classified = classifyApiError(error);
  return recoveryActions(classified, {
    retry: onRetry,
    goHome: () => router.push('/(app)/home' as Href),
  });
}

export function EmptyState({
  testID,
  title,
  illustration,
}: {
  testID: string;
  title: string;
  illustration?: React.ReactNode;
}): React.ReactElement {
  return (
    <View
      testID={testID}
      className="items-center rounded-card border border-border bg-surface p-4"
    >
      {illustration ? (
        <View className="mb-3" pointerEvents="none">
          {illustration}
        </View>
      ) : null}
      <Text className="text-center text-body-sm text-text-secondary">
        {title}
      </Text>
    </View>
  );
}

export function PracticeReportsEmptyMotif({
  testID,
}: {
  testID: string;
}): React.ReactElement {
  return (
    <View
      testID={testID}
      className="h-[92px] w-[176px] items-center justify-center"
      pointerEvents="none"
    >
      <View className="absolute left-0 top-3">
        <DeskLampAnimation size={62} testID={`${testID}-lamp`} />
      </View>
      <View className="absolute left-[58px] top-4">
        <MagicPenAnimation size={58} testID={`${testID}-pen`} />
      </View>
      <View className="absolute right-0 top-1">
        <BookPageFlipAnimation size={66} testID={`${testID}-book`} />
      </View>
    </View>
  );
}
