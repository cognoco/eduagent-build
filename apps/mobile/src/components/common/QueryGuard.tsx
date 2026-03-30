import { type ReactNode } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';

interface QueryGuardProps<T> {
  /** The TanStack Query result to guard on. */
  query: UseQueryResult<T>;
  /** Render function called with the resolved data. */
  children: (data: T) => ReactNode;
  /** Optional custom loading UI. Defaults to a centered spinner. */
  loading?: ReactNode;
  /** Message shown when query succeeds but data is empty (array or null). */
  emptyMessage?: string;
  /** Optional custom empty state UI (overrides emptyMessage). */
  empty?: ReactNode;
  /** Optional custom error UI (overrides default retry card). */
  error?: ReactNode;
}

/**
 * Generic guard component for TanStack Query results.
 *
 * Handles the three states every data-fetching screen needs:
 * - **Loading** → spinner (or custom `loading` prop)
 * - **Error** → retry card with message (or custom `error` prop)
 * - **Empty** → helpful empty-state message (when data is null/empty array)
 * - **Data** → renders `children(data)`
 *
 * Usage:
 * ```tsx
 * const subjects = useSubjects();
 * return (
 *   <QueryGuard query={subjects} emptyMessage="No subjects yet">
 *     {(data) => <SubjectList subjects={data} />}
 *   </QueryGuard>
 * );
 * ```
 */
export function QueryGuard<T>({
  query,
  children,
  loading,
  emptyMessage,
  empty,
  error,
}: QueryGuardProps<T>): ReactNode {
  const { data, isLoading, isError, error: queryError, refetch } = query;

  if (isLoading) {
    return (
      loading ?? (
        <View
          className="py-8 items-center justify-center"
          testID="query-guard-loading"
        >
          <ActivityIndicator size="large" />
        </View>
      )
    );
  }

  if (isError) {
    return (
      error ?? (
        <View
          className="bg-surface rounded-card px-4 py-6 items-center mx-4"
          accessibilityRole="alert"
          testID="query-guard-error"
        >
          <Text className="text-body font-semibold text-text-primary mb-1">
            Something went wrong
          </Text>
          <Text className="text-body-sm text-text-secondary text-center mb-4">
            {queryError?.message ??
              'Please check your connection and try again.'}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            className="bg-primary rounded-button px-5 py-2.5"
            accessibilityLabel="Retry"
            accessibilityRole="button"
            testID="query-guard-retry"
          >
            <Text className="text-text-inverse text-body-sm font-semibold">
              Retry
            </Text>
          </Pressable>
        </View>
      )
    );
  }

  const isEmpty = data == null || (Array.isArray(data) && data.length === 0);

  if (isEmpty && (emptyMessage ?? empty)) {
    return (
      empty ?? (
        <View
          className="py-8 items-center justify-center px-4"
          testID="query-guard-empty"
        >
          <Text className="text-body text-text-secondary text-center">
            {emptyMessage}
          </Text>
        </View>
      )
    );
  }

  // data is guaranteed non-null here (empty guard + loading guard above)
  return <>{children(data as T)}</>;
}
