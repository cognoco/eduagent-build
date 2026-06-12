// uppercase-allowed: PARENT PREVIEW chrome label — preserved from the inline
// definition that used to live in (app)/_layout.tsx.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../lib/theme';
import { getProxyChromeColors } from '../_lib/proxy-chrome';

export function ProxyBanner({
  childName,
  onSwitchBack,
}: {
  childName: string;
  onSwitchBack: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const proxyColors = getProxyChromeColors(colors);

  return (
    <View
      className="flex-row items-center justify-between px-4 border-b"
      style={{
        backgroundColor: proxyColors.background,
        borderBottomColor: proxyColors.border,
        borderBottomWidth: 2,
        paddingTop: insets.top,
        height: 58 + insets.top,
      }}
      testID="proxy-banner"
    >
      <View className="flex-row items-center flex-1">
        {/* decorative leading icon — banner text carries the meaning */}
        <Ionicons
          name="eye-outline"
          size={20}
          color={colors.warning}
          style={{ marginRight: 10 }}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View className="flex-1 pr-3">
          <Text className="text-caption font-bold text-warning uppercase">
            {t('tabs.proxyBanner.parentPreview')}
          </Text>
          <Text
            className="text-body-sm font-semibold text-text-primary"
            numberOfLines={1}
          >
            {t('tabs.proxyBanner.viewing', { name: childName })}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onSwitchBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.proxyBanner.switchBackLabel')}
        className="rounded-full border px-3 py-1.5"
        style={{ borderColor: proxyColors.border }}
        testID="proxy-banner-switch-back"
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('tabs.proxyBanner.switchBack')}
        </Text>
      </Pressable>
    </View>
  );
}
