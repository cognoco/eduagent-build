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
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { HealthCheckItem } from './HealthCheckItem';

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
  // Loading state - show spinner when loading and no existing data
  if (loading && data.length === 0) {
    return (
      <View style={styles.centered} testID="loading-state">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading health checks...</Text>
      </View>
    );
  }

  // Error state - show error message with retry option
  if (error && data.length === 0) {
    return (
      <View style={styles.centered} testID="error-state">
        <Text style={styles.errorTitle}>Error Loading Health Checks</Text>
        <Text style={styles.errorMessage} testID="error-message">
          {error}
        </Text>
        {onRetry && (
          <Pressable
            style={styles.retryButton}
            onPress={onRetry}
            testID="retry-button"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // Empty state - show message when no records exist
  if (!loading && !error && data.length === 0) {
    return (
      <View style={styles.centered} testID="empty-state">
        <Text style={styles.emptyTitle}>No health checks yet</Text>
        <Text style={styles.emptyMessage}>Tap Ping to create one!</Text>
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
          tintColor="#2563eb"
          colors={['#2563eb']}
        />
      }
      contentContainerStyle={styles.listContent}
      testID="health-list"
      ListFooterComponent={
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Showing {data.length} health check{data.length === 1 ? '' : 's'}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#7f1d1d',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  footer: {
    padding: 16,
    borderTopWidth: 2,
    borderTopColor: '#e5e7eb',
    borderStyle: 'dashed',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
  },
});

export default HealthCheckList;
