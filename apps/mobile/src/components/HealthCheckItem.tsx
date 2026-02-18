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
import { View, Text } from 'react-native';
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
    <View
      className="bg-surface p-4 border-b border-border"
      testID="health-check-item"
    >
      <View className="flex-row justify-between items-start mb-2">
        <Text className="text-body font-medium text-text-primary flex-1">
          {item.message}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1">
          {formatTimestamp(item.timestamp)}
        </Text>
      </View>
      <View className="absolute top-4 right-4 bg-success/20 px-3 py-1 rounded-xl">
        <Text className="text-caption font-semibold text-success">OK</Text>
      </View>
      <Text className="text-caption font-mono text-muted mt-2">
        ID: {item.id}
      </Text>
    </View>
  );
}

export default HealthCheckItem;
