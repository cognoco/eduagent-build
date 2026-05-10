import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import * as SecureStore from '../../lib/secure-storage';

const STORAGE_KEY = 'family_orientation_cue_dismissed_v1';

export function FamilyOrientationCue(): React.ReactElement | null {
  const { t } = useTranslation();
  const [state, setState] = React.useState<'pending' | 'show' | 'hide'>(
    'pending',
  );

  React.useEffect(() => {
    let cancelled = false;

    async function readDismissal(): Promise<void> {
      try {
        const value = await SecureStore.getItemAsync(STORAGE_KEY);
        if (!cancelled) {
          setState(value === 'true' ? 'hide' : 'show');
        }
      } catch {
        if (!cancelled) {
          setState('show');
        }
      }
    }

    void readDismissal();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = React.useCallback(() => {
    setState('hide');
    void SecureStore.setItemAsync(STORAGE_KEY, 'true').catch(() => {
      // Non-fatal: the cue may show once more on next launch.
    });
  }, []);

  if (state !== 'show') return null;

  return (
    <View
      className="bg-surface-elevated rounded-card px-4 py-3.5 mt-2 mb-3"
      testID="family-orientation-cue"
      accessibilityRole="alert"
    >
      <Text className="text-body font-semibold text-text-primary mb-1">
        {t('family.orientationCueTitle')}
      </Text>
      <Text className="text-body-sm text-text-secondary mb-3">
        {t('family.orientationCueBody')}
      </Text>
      <Pressable
        onPress={handleDismiss}
        className="self-start"
        testID="family-orientation-cue-dismiss"
        accessibilityRole="button"
        accessibilityLabel={t('family.orientationCueDismiss')}
        hitSlop={8}
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('family.orientationCueDismiss')}
        </Text>
      </Pressable>
    </View>
  );
}
