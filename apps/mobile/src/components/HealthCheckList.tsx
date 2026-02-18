/**
 * HealthCheckList - Main list component for health check records
 *
 * Handles four display states:
 * 1. Loading - Shows activity indicator while fetching
 * 2. Error - Shows error message with retry button
 * 3. Empty - Shows message when no records exist
 * 4. Data - Shows FlatList with health check items
 *
 * @module components/HealthCheckList
 * @see Story 6.3: Implement Mobile Health Check Screen
 * @see AC-6.3.1, AC-6.3.4, AC-6.3.5, AC-6.3.6, AC-6.3.7
 */
import React from 'react';
import {
  FlatList,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { HealthCheckItem } from './HealthCheckItem';
import { useThemeColors } from '../lib/theme';

// TODO: Replace with Hono RPC types in Epic 0
type HealthCheck = { id: string; message: string; timestamp: string };

export interface HealthCheckListProps {
  /** Array of health check records to display */
  data: HealthCheck[];
  /** Whether data is currently being fetched */
  loading: boolean;
  /** Error message if fetch failed, null otherwise */
  error: string | null;
  /** Callback to refresh the list */
  onRefresh: () => void;
  /** Whether a refresh is currently in progress */
  refreshing: boolean;
  /** Optional callback to retry after error */
  onRetry?: () => void;
}

/**
 * Renders the appropriate UI based on current state.
 */
export function HealthCheckList({
  data,
  loading,
  error,
  onRefresh,
  refreshing,
  onRetry,
}: HealthCheckListProps) {
  const colors = useThemeColors();

  // Loading state - show spinner when loading and no existing data
  if (loading && data.length === 0) {
    return (
      <View
        className="flex-1 justify-center items-center p-6"
        testID="loading-state"
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="mt-3 text-body text-text-secondary">
          Loading health checks...
        </Text>
      </View>
    );
  }

  // Error state - show error message with retry option
  if (error && data.length === 0) {
    return (
      <View
        className="flex-1 justify-center items-center p-6"
        testID="error-state"
      >
        <Text className="text-h3 font-semibold text-danger mb-2">
          Error Loading Health Checks
        </Text>
        <Text
          className="text-body-sm text-danger text-center mb-4"
          testID="error-message"
        >
          {error}
        </Text>
        {onRetry && (
          <Pressable
            className="bg-primary px-6 py-3 rounded-button min-h-[44px] min-w-[44px] items-center justify-center"
            onPress={onRetry}
            testID="retry-button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Retry
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  // Empty state - show message when no records exist
  if (!loading && !error && data.length === 0) {
    return (
      <View
        className="flex-1 justify-center items-center p-6"
        testID="empty-state"
      >
        <Text className="text-h3 font-semibold text-text-primary mb-2">
          No health checks yet
        </Text>
        <Text className="text-body-sm text-text-secondary text-center">
          Tap Ping to create one!
        </Text>
      </View>
    );
  }

  // Data state - show FlatList with items and pull-to-refresh
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <HealthCheckItem item={item} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      contentContainerStyle={{ flexGrow: 1 }}
      testID="health-list"
      ListFooterComponent={
        <View className="p-4 border-t-2 border-dashed border-border bg-surface-elevated items-center">
          <Text className="text-body-sm text-text-secondary">
            Showing {data.length} health check{data.length === 1 ? '' : 's'}
          </Text>
        </View>
      }
    />
  );
}

export default HealthCheckList;
