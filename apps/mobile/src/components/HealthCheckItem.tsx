/**
 * HealthCheckItem - Individual health check record display
 *
 * Renders a single health check with message, timestamp, and ID.
 * Follows the same visual structure as the web health page.
 *
 * @module components/HealthCheckItem
 * @see Story 6.3: Implement Mobile Health Check Screen
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
// TODO: Replace with Hono RPC types in Epic 0
type HealthCheck = { id: string; message: string; timestamp: string };

interface HealthCheckItemProps {
  item: HealthCheck;
}

/**
 * Formats an ISO timestamp to a localized date/time string.
 */
function formatTimestamp(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}

export function HealthCheckItem({ item }: HealthCheckItemProps) {
  return (
    <View style={styles.container} testID="health-check-item">
      <View style={styles.content}>
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
      </View>
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>OK</Text>
      </View>
      <Text style={styles.id}>ID: {item.id}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
  },
  timestamp: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  statusBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#d1fae5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065f46',
  },
  id: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#9ca3af',
    marginTop: 8,
  },
});

export default HealthCheckItem;
