import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import * as SecureStore from '../../lib/secure-storage';
import { parentHomeSeenKey } from '../../lib/secure-store-keys';
// [WI-1090] Key definition lives in the barrel; re-exported here for backward
// compatibility with callers that import directly from this component module.
export { parentHomeSeenKey } from '../../lib/secure-store-keys';

export function ParentTransitionNotice({
  profileId,
  childNames,
}: {
  profileId: string | undefined;
  childNames: string;
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
      className="bg-primary-soft rounded-card px-4 py-3.5"
      testID="parent-transition-notice"
      accessibilityRole="alert"
    >
      <Text className="text-body font-semibold text-text-primary">
        {t('home.parent.transitionNoticeTitle', { childNames })}
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
