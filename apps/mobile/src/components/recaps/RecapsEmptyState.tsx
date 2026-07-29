import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '../common';

/**
 * Shared "no recaps yet" empty state — title + body + "Start a session" CTA.
 *
 * Extracted from the V1 `/recaps` screen so the V2 Journal recaps tab renders
 * the same welcoming empty state (with a CTA) instead of its own bare
 * one-liner. The CTA destination differs per surface (the standalone screen
 * goes Home; the Journal goes to the Mentor tab), so it is injected via
 * `onStart` rather than hard-coded. TestIDs are overridable so both surfaces
 * can embed the component while keeping distinct, assertable anchors.
 */
export function RecapsEmptyState({
  onStart,
  testID,
  ctaTestID,
}: {
  onStart: () => void;
  testID?: string;
  ctaTestID?: string;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View
      className="rounded-card border border-border bg-surface px-4 py-5"
      testID={testID ?? 'recaps-empty'}
    >
      <Text className="text-body font-semibold text-text-primary">
        {t('recaps.emptyTitle')}
      </Text>
      <Text className="text-body-sm text-text-secondary mt-2 mb-4">
        {t('recaps.emptyBody')}
      </Text>
      <Button
        variant="primary"
        label={t('recaps.emptyCtaStartSession')}
        onPress={onStart}
        testID={ctaTestID ?? 'recaps-empty-start-session'}
      />
    </View>
  );
}
