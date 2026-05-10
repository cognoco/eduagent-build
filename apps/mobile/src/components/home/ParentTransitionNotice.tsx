import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import * as SecureStore from '../../lib/secure-storage';
import { sanitizeSecureStoreKey } from '../../lib/secure-storage';

export function parentHomeSeenKey(profileId: string): string {
  return sanitizeSecureStoreKey(`mentomate_parent_home_seen_${profileId}`);
}

export function ParentTransitionNotice({
  profileId,
}: {
  profileId: string | undefined;
}): React.ReactElement | null {
  const { t } = useTranslation();
  const [state, setState] = useState<'pending' | 'show' | 'hide'>('pending');

  useEffect(() => {
    if (!profileId) {
      setState('hide');
      return;
    }
    let cancelled = false;
    void SecureStore.getItemAsync(parentHomeSeenKey(profileId))
      .then((value) => {
        if (!cancelled) setState(value === 'true' ? 'hide' : 'show');
      })
      .catch(() => {
        if (!cancelled) setState('show');
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const dismiss = useCallback(() => {
    if (!profileId) return;
    setState('hide');
    void SecureStore.setItemAsync(parentHomeSeenKey(profileId), 'true').catch(
      () => undefined,
    );
  }, [profileId]);

  if (state !== 'show') return null;

  return (
    <View
      className="bg-primary-soft rounded-card px-4 py-3.5 mt-4"
      testID="parent-transition-notice"
      accessibilityRole="alert"
    >
      <Text className="text-body font-semibold text-text-primary">
        {t('home.parent.transitionNoticeTitle')}
      </Text>
      <Text className="text-body-sm text-text-secondary mt-1">
        {t('home.parent.transitionNoticeBody')}
      </Text>
      <Pressable
        onPress={dismiss}
        className="self-start mt-3"
        accessibilityRole="button"
        accessibilityLabel={t('family.orientationCueDismiss')}
        testID="parent-transition-notice-dismiss"
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('family.orientationCueDismiss')}
        </Text>
      </Pressable>
    </View>
  );
}
