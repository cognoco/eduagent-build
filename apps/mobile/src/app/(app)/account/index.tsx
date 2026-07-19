import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AccountAdminSheet } from '../../../components/account/AccountAdminSheet';
import {
  accountReturnHref,
  accountReturnToken,
  goBackOrReplace,
} from '../../../lib/navigation';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

export default function AccountScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { returnTo } = useLocalSearchParams<{
    returnTo?: string | string[];
  }>();
  const returnHref = accountReturnHref(
    returnTo,
    FEATURE_FLAGS.MODE_NAV_V2_ENABLED,
  );
  const returnToken = accountReturnToken(returnTo);
  const returnTabTitle = t(`tabs.${returnToken}`);
  const returnLabel = FEATURE_FLAGS.MODE_NAV_V2_ENABLED
    ? t('accountAdmin.backTo', { destination: returnTabTitle })
    : t('common.goBack');

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="account-screen"
    >
      <View className="px-4 pt-2 pb-1 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, returnHref)}
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
