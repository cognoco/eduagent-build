import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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

function buildDomainOptions(t: TFunction): AnalogyDomainOption[] {
  return [
    {
      value: null,
      label: t('analogyPicker.noPreferenceLabel'),
      description: t('analogyPicker.noPreferenceDescription'),
    },
    {
      value: 'cooking',
      label: t('analogyPicker.cookingLabel'),
      description: t('analogyPicker.cookingDescription'),
    },
    {
      value: 'sports',
      label: t('analogyPicker.sportsLabel'),
      description: t('analogyPicker.sportsDescription'),
    },
    {
      value: 'building',
      label: t('analogyPicker.buildingLabel'),
      description: t('analogyPicker.buildingDescription'),
    },
    {
      value: 'music',
      label: t('analogyPicker.musicLabel'),
      description: t('analogyPicker.musicDescription'),
    },
    {
      value: 'nature',
      label: t('analogyPicker.natureLabel'),
      description: t('analogyPicker.natureDescription'),
    },
    {
      value: 'gaming',
      label: t('analogyPicker.gamingLabel'),
      description: t('analogyPicker.gamingDescription'),
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnalogyDomainPicker({
  value,
  onSelect,
  isLoading,
  disabled,
}: AnalogyDomainPickerProps): React.JSX.Element {
  const { t } = useTranslation();
  const domainOptions = buildDomainOptions(t);
  const handleSelect = useCallback(
    (domain: AnalogyDomain | null) => {
      if (!disabled) {
        onSelect(domain);
      }
    },
    [onSelect, disabled],
  );

  if (isLoading) {
    return (
      <View className="py-4 items-center" testID="analogy-domain-loading">
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  return (
    <View testID="analogy-domain-picker">
      {domainOptions.map((option) => {
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
                  {t('common.active')}
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
