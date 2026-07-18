import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { EligibleManagedPerson } from '../../hooks/use-eligible-supportees';
import { BottomSheet } from '../common/BottomSheet';

interface SupportPersonPickerSheetProps {
  visible: boolean;
  eligiblePersons: readonly EligibleManagedPerson[];
  onSelectPerson: (person: EligibleManagedPerson) => void;
  onAddChild: () => void;
  /**
   * [WI-1137 Codex P2] Persistent entry into `/(app)/link/initiate`'s own
   * param-less inline picker (which offers the join-my-family
   * existing-teen path). Rendered regardless of `eligiblePersons.length` so
   * that path is reachable whether or not the owner already has managed
   * children — it must not be nested under the zero-eligible degrade.
   */
  onSelectExistingTeen: () => void;
  onClose: () => void;
}

/**
 * WI-1393 — the "start supporting" picker opened from the V2 support-hub
 * anchors (cold-start empty state, persistent header action, Subjects empty
 * state). Lists managed persons without an existing visibility contract;
 * selecting one carries `supporteePersonId` into `/(app)/link/initiate` so that
 * screen's missing-param `ErrorFallback` is never reached from these
 * anchors. When there are zero eligible persons, degrades to an "add a
 * child" affordance instead of dead-ending.
 */
export function SupportPersonPickerSheet({
  visible,
  eligiblePersons,
  onSelectPerson,
  onAddChild,
  onSelectExistingTeen,
  onClose,
}: SupportPersonPickerSheetProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backdropDismissible
      backdropAccessibilityLabel={t('supportHub.picker.closeLabel')}
      accessibilityLabel={t('supportHub.picker.title')}
      testID="support-person-picker-sheet"
    >
      <View className="bg-background px-5 pt-5 pb-8">
        <View className="mb-4 items-center">
          <View className="h-1 w-10 rounded-full bg-text-secondary/30" />
        </View>

        <Text className="mb-1 text-h3 font-semibold text-text-primary">
          {t('supportHub.picker.title')}
        </Text>

        {eligiblePersons.length === 0 ? (
          <View
            className="items-center py-6"
            testID="support-person-picker-empty"
          >
            <Text className="text-center text-body font-semibold text-text-primary">
              {t('supportHub.picker.emptyTitle')}
            </Text>
            <Text className="mt-2 text-center text-body-sm text-text-secondary">
              {t('supportHub.picker.emptyDescription')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('supportHub.picker.addChildAction')}
              onPress={onAddChild}
              className="mt-5 min-h-[44px] items-center justify-center rounded-button bg-primary px-5 py-3"
              testID="support-person-picker-add-child"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('supportHub.picker.addChildAction')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text className="mb-4 text-body-sm text-text-secondary">
              {t('supportHub.picker.subtitle')}
            </Text>
            <ScrollView
              style={{ maxHeight: 320 }}
              showsVerticalScrollIndicator={false}
            >
              {eligiblePersons.map((person) => (
                <Pressable
                  key={person.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('supportHub.picker.optionHint', {
                    name: person.displayName,
                  })}
                  onPress={() => onSelectPerson(person)}
                  className="mb-2 rounded-card bg-surface px-4 py-3"
                  testID={`support-person-picker-option-${person.id}`}
                >
                  <Text className="font-semibold text-text-primary">
                    {person.displayName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('supportHub.picker.existingTeenOption')}
          onPress={onSelectExistingTeen}
          className="mt-4 min-h-[44px] items-center justify-center rounded-button border border-border px-5 py-3"
          testID="support-person-picker-existing-teen"
        >
          <Text className="text-body font-semibold text-text-primary">
            {t('supportHub.picker.existingTeenOption')}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
