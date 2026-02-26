import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useCallback } from 'react';
import type { AnalogyDomain } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalogyDomainOption {
  value: AnalogyDomain | null;
  label: string;
  description: string;
}

interface AnalogyDomainPickerProps {
  value: AnalogyDomain | null | undefined;
  onSelect: (domain: AnalogyDomain | null) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Domain options
// ---------------------------------------------------------------------------

const DOMAIN_OPTIONS: AnalogyDomainOption[] = [
  {
    value: null,
    label: 'No preference',
    description: 'Use whatever analogy fits best',
  },
  {
    value: 'cooking',
    label: 'Cooking',
    description: 'Recipes, ingredients, kitchen techniques',
  },
  {
    value: 'sports',
    label: 'Sports',
    description: 'Games, teams, training strategies',
  },
  {
    value: 'building',
    label: 'Building',
    description: 'Construction, architecture, tools',
  },
  {
    value: 'music',
    label: 'Music',
    description: 'Instruments, rhythm, composition',
  },
  {
    value: 'nature',
    label: 'Nature',
    description: 'Plants, animals, ecosystems',
  },
  {
    value: 'gaming',
    label: 'Gaming',
    description: 'Levels, quests, game mechanics',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnalogyDomainPicker({
  value,
  onSelect,
  isLoading,
  disabled,
}: AnalogyDomainPickerProps): React.JSX.Element {
  const handleSelect = useCallback(
    (domain: AnalogyDomain | null) => {
      if (!disabled) {
        onSelect(domain);
      }
    },
    [onSelect, disabled]
  );

  if (isLoading) {
    return (
      <View className="py-4 items-center" testID="analogy-domain-loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View testID="analogy-domain-picker">
      {DOMAIN_OPTIONS.map((option) => {
        const isSelected =
          value === option.value ||
          (value === undefined && option.value === null);

        return (
          <Pressable
            key={option.value ?? 'none'}
            onPress={() => handleSelect(option.value)}
            disabled={disabled}
            className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
              isSelected
                ? 'border-2 border-primary'
                : 'border-2 border-transparent'
            }`}
            accessibilityLabel={`${option.label}: ${option.description}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled }}
            testID={`analogy-domain-${option.value ?? 'none'}`}
            style={{ minHeight: 44 }}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-body font-semibold text-text-primary">
                {option.label}
              </Text>
              {isSelected && (
                <Text className="text-primary text-body font-semibold">
                  Active
                </Text>
              )}
            </View>
            <Text className="text-body-sm text-text-secondary mt-1">
              {option.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
