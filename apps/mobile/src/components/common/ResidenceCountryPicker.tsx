import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResidenceCountryOption } from '@eduagent/schemas';
import { ErrorFallback } from './ErrorFallback';

interface ResidenceCountryPickerProps {
  /**
   * Options come in as a PROP rather than the component calling
   * `useResidenceCountries()` itself. That is deliberate: a component that
   * called the hook internally could only be tested by `jest.mock`-ing an
   * internal module, which fails GC1 in CI. Props keep it pure and let the
   * three AC-1 surfaces own their own fetch and error placement.
   */
  options: ResidenceCountryOption[];
  /** Selected ISO 3166-1 alpha-2 code, or null/undefined when nothing is chosen. */
  value: string | null | undefined;
  onSelect: (countryCode: string) => void;
  /**
   * Copy variant. The same picker serves signup (the learner is the reader) and
   * add-child (the learner is someone else), mirroring the existing
   * `birthDateHint` / `childBirthDateHint` split in `createProfile`.
   */
  audience?: 'self' | 'child';
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  disabled?: boolean;
}

/**
 * [WI-2743 AC-1/AC-6] Habitual-residence country picker.
 *
 * The options are sourced from `country_policy_registry` by the caller's hook —
 * never a hard-coded list — because the registry is the thing that decides
 * jurisdiction, and a picker offering a country the registry does not know
 * would collect an answer the resolver cannot act on.
 *
 * AC-6 lives in the hint copy: habitual residence is not nationality, not
 * billing country, and not App Store country. All three are named explicitly
 * rather than implied, because each is a plausible misreading that would put a
 * learner under the wrong jurisdiction.
 */
export function ResidenceCountryPicker({
  options,
  value,
  onSelect,
  audience = 'self',
  isLoading,
  isError,
  onRetry,
  disabled,
}: ResidenceCountryPickerProps): React.JSX.Element {
  const { t } = useTranslation();

  const handleSelect = useCallback(
    (countryCode: string) => {
      if (!disabled) {
        onSelect(countryCode);
      }
    },
    [onSelect, disabled],
  );

  if (isLoading) {
    return (
      <View className="py-4 items-center" testID="residence-country-loading">
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (isError) {
    // An empty picker is indistinguishable from "no countries exist", which
    // reads as a dead form rather than a fault. Surface it, with a way out.
    return (
      <ErrorFallback
        title={t('residenceCountryPicker.errorTitle')}
        message={t('residenceCountryPicker.errorBody')}
        primaryAction={
          onRetry
            ? {
                label: t('common.retry'),
                onPress: onRetry,
                testID: 'residence-country-retry',
              }
            : undefined
        }
        testID="residence-country-error"
      />
    );
  }

  return (
    <View testID="residence-country-picker">
      <Text className="text-body font-semibold text-text-primary">
        {t('residenceCountryPicker.label')}
      </Text>
      <Text className="text-body-sm text-text-secondary mt-1 mb-3">
        {t(
          audience === 'child'
            ? 'residenceCountryPicker.childHint'
            : 'residenceCountryPicker.hint',
        )}
      </Text>

      {options.length === 0 ? (
        <Text
          className="text-body-sm text-text-secondary"
          testID="residence-country-empty"
        >
          {t('residenceCountryPicker.empty')}
        </Text>
      ) : (
        options.map((option) => {
          const isSelected = value === option.countryCode;

          return (
            <Pressable
              key={option.countryCode}
              onPress={() => handleSelect(option.countryCode)}
              disabled={disabled}
              className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
                isSelected
                  ? 'border-2 border-primary'
                  : 'border-2 border-transparent'
              }`}
              accessibilityLabel={option.countryName}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled }}
              testID={`residence-country-${option.countryCode}`}
              style={{ minHeight: 44 }}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-body text-text-primary">
                  {option.countryName}
                </Text>
                {isSelected && (
                  <Text className="text-primary text-body font-semibold">
                    {t('common.active')}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}
