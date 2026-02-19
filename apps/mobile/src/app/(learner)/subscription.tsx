import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeColors } from '../../lib/theme';
import { UsageMeter } from '../../components/common';
import {
  useSubscription,
  useUsage,
  useCreateCheckout,
  useCancelSubscription,
  useCreatePortalSession,
  usePurchaseTopUp,
  useJoinByokWaitlist,
  type SubscriptionTier,
} from '../../hooks/use-subscription';

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  plus: 'Plus',
  family: 'Family',
  pro: 'Pro',
};

const TIER_LIMITS: Record<SubscriptionTier, string> = {
  free: '50 questions/month',
  plus: '500 questions/month',
  family: '1,000 questions/month (shared)',
  pro: '2,000 questions/month',
};

interface PlanOptionProps {
  tier: 'plus' | 'family' | 'pro';
  currentTier: SubscriptionTier;
  onSelect: (tier: 'plus' | 'family' | 'pro') => void;
  isPending: boolean;
}

function PlanOption({
  tier,
  currentTier,
  onSelect,
  isPending,
}: PlanOptionProps) {
  const isCurrentPlan = tier === currentTier;

  return (
    <Pressable
      onPress={() => !isCurrentPlan && onSelect(tier)}
      disabled={isCurrentPlan || isPending}
      className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
        isCurrentPlan ? 'border border-primary' : ''
      }`}
      accessibilityLabel={`${isCurrentPlan ? 'Current plan' : 'Upgrade to'} ${
        TIER_LABELS[tier]
      }`}
      accessibilityRole="button"
    >
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-body font-semibold text-text-primary">
            {TIER_LABELS[tier]}
          </Text>
          <Text className="text-caption text-text-secondary mt-0.5">
            {TIER_LIMITS[tier]}
          </Text>
        </View>
        {isCurrentPlan ? (
          <Text className="text-caption font-semibold text-primary">
            Current plan
          </Text>
        ) : (
          <Text className="text-caption font-semibold text-primary">
            Upgrade
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const [byokEmail, setByokEmail] = useState('');

  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: usage, isLoading: usageLoading } = useUsage();
  const checkout = useCreateCheckout();
  const cancel = useCancelSubscription();
  const portal = useCreatePortalSession();
  const topUp = usePurchaseTopUp();
  const byokWaitlist = useJoinByokWaitlist();

  const isLoading = subLoading || usageLoading;
  const tier = subscription?.tier ?? 'free';
  const status = subscription?.status ?? 'trial';
  const isTrial = status === 'trial';
  const isPaidTier = tier !== 'free';
  const cancelAtPeriodEnd = subscription?.cancelAtPeriodEnd ?? false;

  const handleUpgrade = useCallback(
    async (selectedTier: 'plus' | 'family' | 'pro') => {
      try {
        const result = await checkout.mutateAsync({
          tier: selectedTier,
          interval: 'monthly',
        });
        await Linking.openURL(result.checkoutUrl);
      } catch {
        Alert.alert('Checkout error', 'Could not open checkout. Try again.');
      }
    },
    [checkout]
  );

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Cancel subscription',
      'Your access continues until the end of your billing period. Are you sure?',
      [
        { text: 'Keep plan', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await cancel.mutateAsync();
              Alert.alert('Cancelled', result.message);
            } catch {
              Alert.alert('Error', 'Could not cancel. Please try again.');
            }
          },
        },
      ]
    );
  }, [cancel]);

  const handleManageBilling = useCallback(async () => {
    try {
      const result = await portal.mutateAsync();
      await Linking.openURL(result.portalUrl);
    } catch {
      Alert.alert('Error', 'Could not open billing portal. Try again.');
    }
  }, [portal]);

  const handleTopUp = useCallback(async () => {
    try {
      await topUp.mutateAsync();
      Alert.alert('Top-up', '500 additional credits purchased.');
    } catch {
      Alert.alert('Error', 'Could not purchase top-up. Try again.');
    }
  }, [topUp]);

  const handleByokSubmit = useCallback(async () => {
    if (!byokEmail.trim()) return;
    try {
      await byokWaitlist.mutateAsync({ email: byokEmail.trim() });
      Alert.alert('Waitlist', 'You have been added to the BYOK waitlist.');
      setByokEmail('');
    } catch {
      Alert.alert('Error', 'Could not join waitlist. Try again.');
    }
  }, [byokWaitlist, byokEmail]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 min-w-[44px] min-h-[44px] justify-center items-center"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">Back</Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          Subscription
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* Trial banner */}
          {isTrial && subscription?.trialEndsAt && (
            <View className="bg-primary-soft rounded-card px-4 py-3 mt-4">
              <Text className="text-body font-semibold text-primary">
                Trial active
              </Text>
              <Text className="text-caption text-text-secondary mt-0.5">
                Your trial ends on{' '}
                {new Date(subscription.trialEndsAt).toLocaleDateString()}.
                Upgrade to keep learning.
              </Text>
            </View>
          )}

          {/* Current plan */}
          <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2 mt-4">
            Current plan
          </Text>
          <View className="bg-surface rounded-card px-4 py-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-body font-semibold text-text-primary">
                {TIER_LABELS[tier]}
              </Text>
              <View className="bg-primary-soft rounded-full px-2.5 py-1">
                <Text className="text-caption font-semibold text-primary capitalize">
                  {cancelAtPeriodEnd
                    ? 'Cancelling'
                    : status === 'past_due'
                    ? 'Past due'
                    : status}
                </Text>
              </View>
            </View>
            <Text className="text-caption text-text-secondary mt-1">
              {TIER_LIMITS[tier]}
            </Text>
            {subscription?.currentPeriodEnd && isPaidTier && (
              <Text className="text-caption text-text-secondary mt-1">
                {cancelAtPeriodEnd
                  ? `Access until ${new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString()}`
                  : `Renews ${new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString()}`}
              </Text>
            )}
          </View>

          {/* Cancellation notice */}
          {cancelAtPeriodEnd && subscription?.currentPeriodEnd && (
            <View className="bg-warning-soft rounded-card px-4 py-3 mt-2">
              <Text className="text-body-sm font-semibold text-warning">
                Subscription ending
              </Text>
              <Text className="text-caption text-text-secondary mt-0.5">
                Your subscription has been cancelled. You can continue using all
                features until{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                After that, your account will revert to the Free tier.
              </Text>
            </View>
          )}

          {/* Usage meter */}
          {usage && (
            <View className="mt-4">
              <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Usage this month
              </Text>
              <View className="bg-surface rounded-card px-4 py-3.5">
                <UsageMeter
                  used={usage.usedThisMonth}
                  limit={usage.monthlyLimit}
                  warningLevel={usage.warningLevel}
                />
                {usage.topUpCreditsRemaining > 0 && (
                  <Text className="text-caption text-text-secondary mt-2">
                    + {usage.topUpCreditsRemaining} top-up credits remaining
                  </Text>
                )}
                <Text className="text-caption text-text-secondary mt-1">
                  Resets {new Date(usage.cycleResetAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          )}

          {/* Upgrade options */}
          <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2 mt-6">
            Plans
          </Text>
          <PlanOption
            tier="plus"
            currentTier={tier}
            onSelect={handleUpgrade}
            isPending={checkout.isPending}
          />
          <PlanOption
            tier="family"
            currentTier={tier}
            onSelect={handleUpgrade}
            isPending={checkout.isPending}
          />
          <PlanOption
            tier="pro"
            currentTier={tier}
            onSelect={handleUpgrade}
            isPending={checkout.isPending}
          />

          {/* Top-up */}
          {isPaidTier && (
            <View className="mt-6">
              <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Need more questions?
              </Text>
              <Pressable
                onPress={handleTopUp}
                disabled={topUp.isPending}
                className="bg-surface rounded-card px-4 py-3.5"
                accessibilityLabel="Buy 500 credits"
                accessibilityRole="button"
              >
                <Text className="text-body font-semibold text-primary">
                  Buy 500 credits
                </Text>
                <Text className="text-caption text-text-secondary mt-0.5">
                  One-time purchase. Credits never expire.
                </Text>
              </Pressable>
            </View>
          )}

          {/* Manage billing / Cancel */}
          {isPaidTier && status === 'active' && (
            <View className="mt-6">
              <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Manage
              </Text>
              <Pressable
                onPress={handleManageBilling}
                disabled={portal.isPending}
                className="bg-surface rounded-card px-4 py-3.5 mb-2"
                accessibilityLabel="Manage billing"
                accessibilityRole="button"
              >
                <Text className="text-body text-text-primary">
                  Manage billing
                </Text>
              </Pressable>
              {!cancelAtPeriodEnd && (
                <Pressable
                  onPress={handleCancel}
                  disabled={cancel.isPending}
                  className="bg-surface rounded-card px-4 py-3.5"
                  accessibilityLabel="Cancel subscription"
                  accessibilityRole="button"
                >
                  <Text className="text-body text-danger">
                    Cancel subscription
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* BYOK waitlist */}
          <View className="mt-6">
            <Text className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Bring your own key (coming soon)
            </Text>
            <View className="bg-surface rounded-card px-4 py-3.5">
              <Text className="text-body-sm text-text-secondary mb-3">
                Use your own API key to unlock unlimited questions. Join the
                waitlist to be notified when available.
              </Text>
              <View className="flex-row">
                <TextInput
                  value={byokEmail}
                  onChangeText={setByokEmail}
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="flex-1 bg-background rounded-button px-3 py-2.5 text-body text-text-primary mr-2"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Email for BYOK waitlist"
                />
                <Pressable
                  onPress={handleByokSubmit}
                  disabled={byokWaitlist.isPending || !byokEmail.trim()}
                  className="bg-primary rounded-button px-4 py-2.5 justify-center"
                  accessibilityLabel="Join BYOK waitlist"
                  accessibilityRole="button"
                >
                  <Text className="text-text-inverse text-body font-semibold">
                    Join
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
