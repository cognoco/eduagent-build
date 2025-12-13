/**
 * Mobile App - Health Check Screen
 *
 * Walking skeleton mobile app demonstrating end-to-end data flow:
 * Mobile → API Client → Express Server → Prisma → Supabase
 *
 * This screen mirrors the web health page functionality, allowing users to:
 * - View list of health check records
 * - Create new health checks via the Ping button
 * - Pull-to-refresh the list
 *
 * @module app/App
 * @see Story 6.3: Implement Mobile Health Check Screen
 */
import React from 'react';
import { StyleSheet, View, Text, StatusBar, Pressable } from 'react-native';
import { HealthCheckList } from '../components/HealthCheckList';
import { useHealthChecks } from '../hooks/useHealthChecks';
import { useCreateHealthCheck } from '../hooks/useCreateHealthCheck';

/**
 * Main App component - Health Check Screen
 *
 * Combines the HealthCheckList component with useHealthChecks and
 * useCreateHealthCheck hooks to provide full health check functionality.
 */
export const App = () => {
  // Fetch health checks
  const { data, loading, error, refetch, refreshing } = useHealthChecks();

  // Create health check mutation (triggers refetch on success)
  const { createHealthCheck, mutating } = useCreateHealthCheck({
    onSuccess: refetch,
  });

  // Handle ping button press
  const handlePing = () => {
    createHealthCheck('Mobile ping');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} testID="page-title">
          Health Checks
        </Text>
        <Pressable
          style={[
            styles.pingButton,
            (mutating || loading) && styles.pingButtonDisabled,
          ]}
          onPress={handlePing}
          disabled={mutating || loading}
          testID="ping-button"
        >
          <Text style={styles.pingButtonText}>
            {mutating ? 'Pinging...' : 'Ping'}
          </Text>
        </Pressable>
      </View>

      {/* Health Check List */}
      <View style={styles.content}>
        <HealthCheckList
          data={data}
          loading={loading}
          error={error}
          onRefresh={refetch}
          refreshing={refreshing}
          onRetry={refetch}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingTop: 48, // Account for status bar on mobile
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  pingButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pingButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  pingButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
});

export default App;
