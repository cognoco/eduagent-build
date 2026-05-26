import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PurchasesPackage } from 'react-native-purchases';
import { getPackagePeriodLabel } from '../purchase-errors';

export interface PackageOptionProps {
  pkg: PurchasesPackage;
  isCurrentPlan: boolean;
  onSelect: (pkg: PurchasesPackage) => void;
  isPurchasing: boolean;
}

export function PackageOption({
  pkg,
  isCurrentPlan,
  onSelect,
  isPurchasing,
}: PackageOptionProps): React.ReactElement {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => !isCurrentPlan && onSelect(pkg)}
      disabled={isCurrentPlan || isPurchasing}
      className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
        isCurrentPlan ? 'border border-primary' : ''
      }`}
      accessibilityLabel={
        isCurrentPlan
          ? t(
              'subscriptionScreen.packageOption.currentPlanAccessibilityLabel',
              {
                title: pkg.product.title,
                price: pkg.product.priceString,
              },
            )
          : t(
              'subscriptionScreen.packageOption.subscribePlanAccessibilityLabel',
              {
                title: pkg.product.title,
                price: pkg.product.priceString,
              },
            )
      }
      accessibilityRole="button"
      testID={`package-option-${pkg.identifier}`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-body font-semibold text-text-primary">
            {pkg.product.title}
          </Text>
          <Text className="text-caption text-text-secondary mt-0.5">
            {pkg.product.priceString} /{' '}
            {getPackagePeriodLabel(pkg, t).toLowerCase()}
          </Text>
          {pkg.product.description ? (
            <Text className="text-caption text-text-secondary mt-0.5">
              {pkg.product.description}
            </Text>
          ) : null}
        </View>
        {isCurrentPlan ? (
          <Text className="text-caption font-semibold text-primary">
            {t('subscriptionScreen.packageOption.currentPlanLabel')}
          </Text>
        ) : (
          <Text className="text-caption font-semibold text-primary">
            {isPurchasing
              ? t('subscriptionScreen.packageOption.processingLabel')
              : t('subscriptionScreen.packageOption.subscribeLabel')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
