import { Pressable, Text, TextInput, View } from 'react-native';
import { computeAgeBracket } from '@eduagent/schemas';

type TellMentorAudience = 'learner' | 'parent';

interface TellMentorInputProps {
  audience?: TellMentorAudience;
  birthYear?: number | null;
  childName?: string;
  value: string;
  isPending?: boolean;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
}

function getCopy(
  audience: TellMentorAudience,
  birthYear?: number | null,
  childName?: string,
): {
  title: string;
  description: string;
  placeholder: string;
  suggestions: string[];
} {
  if (audience === 'parent') {
    return {
      title: 'Tell the Mentor',
      description: `Add something important for the mentor to remember about ${
        childName ?? 'this child'
      }.`,
      placeholder:
        'They do best with short examples and still get stuck on fractions.',
      suggestions: [],
    };
  }

  const bracket =
    birthYear == null ? 'adolescent' : computeAgeBracket(birthYear);

  if (bracket === 'adult') {
    return {
      title: 'Add a Note for Your Mentor',
      description:
        'Add something you want your mentor to remember for future sessions.',
      placeholder: 'Examples really help me understand fractions.',
      suggestions: [],
    };
  }

  return {
    title: 'Tell Your Mentor Something',
    description:
      'Add what helps you learn, what you enjoy, or what still feels tricky.',
    placeholder: 'Examples really help me understand fractions.',
    suggestions: [],
  };
}

export function TellMentorInput({
  audience = 'learner',
  birthYear,
  childName,
  value,
  isPending,
  onChangeText,
  onSubmit,
}: TellMentorInputProps) {
  const copy = getCopy(audience, birthYear, childName);
  const disabled = isPending || value.trim().length === 0;

  return (
    <View className="bg-surface rounded-card p-4">
      <Text className="text-body font-semibold text-text-primary">
        {copy.title}
      </Text>
      <Text className="text-body-sm text-text-secondary mt-1 mb-3">
        {copy.description}
      </Text>

      {copy.suggestions.length > 0 ? (
        <View className="flex-row flex-wrap mb-3">
          {copy.suggestions.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => onChangeText(suggestion)}
              className="rounded-full bg-primary/10 px-3 py-1.5 me-2 mb-2"
              accessibilityRole="button"
              accessibilityLabel={suggestion}
            >
              <Text className="text-caption font-semibold text-primary">
                {suggestion}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline
        placeholder={copy.placeholder}
        className="bg-background rounded-card px-4 py-3 text-body text-text-primary min-h-[96px]"
      />
      <Pressable
        onPress={onSubmit}
        disabled={disabled}
        className={`rounded-button px-4 py-3 items-center mt-3 ${
          disabled ? 'bg-primary/50' : 'bg-primary'
        }`}
      >
        <Text className="text-body font-semibold text-text-inverse">
          {isPending ? 'Saving...' : 'Save'}
        </Text>
      </Pressable>
    </View>
  );
}
