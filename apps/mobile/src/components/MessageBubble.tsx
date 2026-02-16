import { View, Text } from 'react-native';

interface MessageBubbleProps {
  role: 'ai' | 'user';
  content: string;
  streaming?: boolean;
  isDark?: boolean;
}

export function MessageBubble({
  role,
  content,
  streaming,
  isDark = true,
}: MessageBubbleProps) {
  const isAI = role === 'ai';

  return (
    <View className={`mb-3 max-w-[85%] ${isAI ? 'self-start' : 'self-end'}`}>
      <View
        className={`rounded-2xl px-4 py-3 ${
          isAI ? (isDark ? 'bg-[#262626]' : 'bg-[#f1f5f9]') : 'bg-primary'
        }`}
      >
        <Text
          className={`text-body leading-relaxed ${
            isAI
              ? isDark
                ? 'text-[#f5f5f5]'
                : 'text-[#0f172a]'
              : 'text-text-inverse'
          }`}
        >
          {content}
          {streaming && <Text className="text-accent"> ▌</Text>}
        </Text>
      </View>
    </View>
  );
}
