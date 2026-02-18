import { View, Text } from 'react-native';

interface MessageBubbleProps {
  role: 'ai' | 'user';
  content: string;
  streaming?: boolean;
}

export function MessageBubble({
  role,
  content,
  streaming,
}: MessageBubbleProps) {
  const isAI = role === 'ai';

  return (
    <View className={`mb-3 max-w-[85%] ${isAI ? 'self-start' : 'self-end'}`}>
      <View
        className={`rounded-2xl px-4 py-3 ${
          isAI ? 'bg-surface-elevated' : 'bg-primary'
        }`}
      >
        <Text
          className={`text-body leading-relaxed ${
            isAI ? 'text-text-primary' : 'text-text-inverse'
          }`}
        >
          {content}
          {streaming && <Text className="text-accent"> ▌</Text>}
        </Text>
      </View>
    </View>
  );
}
