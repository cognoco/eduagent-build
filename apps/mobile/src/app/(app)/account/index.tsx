import { useCallback } from 'react';
import { BackHandler, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AccountAdminSheet } from '../../../components/account/AccountAdminSheet';
import {
  accountReturnHref,
  accountReturnToken,
  goBackOrReplace,
  type V2AccountReturnToken,
} from '../../../lib/navigation';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

const V2_ACCOUNT_RETURN_TAB_KEYS = {
  mentor: 'tabs.mentor',
  subjects: 'tabs.subjects',
  journal: 'tabs.journal',
} as const satisfies Record<V2AccountReturnToken, string>;

export default function AccountScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { returnTo } = useLocalSearchParams<{
    returnTo?: string | string[];
  }>();
  const v2Enabled = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
  const returnHref = accountReturnHref(returnTo, v2Enabled);
  const returnToken = accountReturnToken(returnTo);
  const returnTabTitle = t(V2_ACCOUNT_RETURN_TAB_KEYS[returnToken]);
  const returnLabel = v2Enabled
    ? t('accountAdmin.backTo', { destination: returnTabTitle })
    : t('common.goBack');
  const returnToV2Root = useCallback(() => {
    router.replace(returnHref);
  }, [returnHref, router]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !v2Enabled) return undefined;

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          returnToV2Root();
          return true;
        },
      );
      return () => subscription.remove();
    }, [returnToV2Root, v2Enabled]),
  );

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="account-screen"
    >
      <View className="px-4 pt-2 pb-1 flex-row items-center">
        <Pressable
          onPress={() => {
            if (v2Enabled) {
              returnToV2Root();
              return;
            }
            goBackOrReplace(router, returnHref);
          }}
          accessibilityRole="button"
          accessibilityLabel={returnLabel}
          hitSlop={8}
          testID="account-back"
        >
          <Ionicons name="arrow-back" size={24} className="text-text-primary" />
        </Pressable>
      </View>
      <AccountAdminSheet />
    </View>
  );
}
