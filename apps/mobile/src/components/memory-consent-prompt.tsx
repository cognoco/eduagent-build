import { View, Text, Pressable } from 'react-native';

interface MemoryConsentPromptProps {
  childName?: string;
  isPending?: boolean;
  onGrant: () => void;
  onDecline: () => void;
}

export function MemoryConsentPrompt({
  childName,
  isPending,
  onGrant,
  onDecline,
}: MemoryConsentPromptProps) {
  return (
    <View className="bg-surface rounded-card p-4 border border-border">
      <Text className="text-body font-semibold text-text-primary mb-1">
        Help the mentor learn about {childName ?? 'your child'}
      </Text>
      <Text className="text-body-sm text-text-secondary mb-4">
        This lets the mentor remember what kinds of explanations work, what is
        still tricky, and which examples feel relevant.
      </Text>
      <View className="flex-row gap-2">
        <Pressable
          onPress={onGrant}
          disabled={isPending}
          className="flex-1 bg-primary rounded-button px-4 py-3 items-center"
          accessibilityRole="button"
          accessibilityLabel="Enable mentor memory"
          testID="memory-consent-grant"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {isPending ? 'Saving...' : 'Yes, enable'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDecline}
          disabled={isPending}
          className="flex-1 bg-background rounded-button px-4 py-3 items-center border border-border"
          accessibilityRole="button"
          accessibilityLabel="Decline mentor memory"
          testID="memory-consent-decline"
        >
          <Text className="text-body font-semibold text-text-primary">
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
