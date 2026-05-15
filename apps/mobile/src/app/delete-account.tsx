import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDeleteAccount,
  useCancelDeletion,
  useDeletionStatus,
} from '../hooks/use-account';
import { useThemeColors } from '../lib/theme';
import { goBackOrReplace } from '../lib/navigation';
import { formatApiError } from '../lib/format-api-error';
import { platformAlert } from '../lib/platform-alert';
import { signOutWithCleanup } from '../lib/sign-out';
import { useProfile } from '../lib/profile';

// [BUG-910] The exact phrase a user must type to confirm. Kept as a constant
// so tests and accessibility labels stay in sync.
const DELETE_CONFIRMATION_PHRASE = 'DELETE';

type Stage = 'initial' | 'confirming' | 'scheduled';

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const { profiles } = useProfile();
  const deleteAccount = useDeleteAccount();
  const cancelDeletion = useCancelDeletion();
  const deletionStatus = useDeletionStatus();

  const [stage, setStage] = useState<Stage>('initial');
  const [confirmText, setConfirmText] = useState('');
  const [gracePeriodEnds, setGracePeriodEnds] = useState<string | null>(null);
  const [error, setError] = useState('');
  // [BUG-820] Ref-based guard against double-submission. The mutation's
  // isPending flips a tick after we call mutateAsync — a fast double-tap on
  // the destructive button could fire two requests. A ref toggled
  // synchronously around the mutation closes that race.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (deletionStatus.data?.scheduled !== true) return;
    setGracePeriodEnds(deletionStatus.data.gracePeriodEnds);
    setStage('scheduled');
  }, [deletionStatus.data]);

  const handleClose = useCallback(() => {
    goBackOrReplace(router, '/(app)/more');
  }, [router]);

  // Step 1: user taps "I understand…" — move to typed-confirmation step.
  const onBeginConfirm = useCallback(() => {
    setError('');
    setConfirmText('');
    setStage('confirming');
  }, []);

  // Step 2: user has typed DELETE and taps the destructive button — fire
  // the mutation. The button is only enabled when the typed phrase
  // matches exactly, so this is the final commit.
  const onConfirmDelete = useCallback(async () => {
    if (submittingRef.current) return;
    if (confirmText !== DELETE_CONFIRMATION_PHRASE) return;
    submittingRef.current = true;
    setError('');
    try {
      const result = await deleteAccount.mutateAsync();
      setGracePeriodEnds(result.gracePeriodEnds);
      setStage('scheduled');
    } catch (err: unknown) {
      setError(formatApiError(err));
    } finally {
      submittingRef.current = false;
    }
  }, [deleteAccount, confirmText]);

  const onBackToWarning = useCallback(() => {
    setConfirmText('');
    setError('');
    setStage('initial');
  }, []);

  const onCancelDeletion = useCallback(async () => {
    setError('');
    try {
      await cancelDeletion.mutateAsync();
      await queryClient.invalidateQueries({
        queryKey: ['account', 'deletion-status'],
      });
      handleClose();
    } catch (err: unknown) {
      setError(formatApiError(err));
    }
  }, [cancelDeletion, handleClose, queryClient]);

  const isLoading =
    deleteAccount.isPending ||
    cancelDeletion.isPending ||
    deletionStatus.isLoading;
  const statusLoadFailed = deletionStatus.isError && stage !== 'scheduled';
  const canConfirm =
    confirmText === DELETE_CONFIRMATION_PHRASE &&
    !deleteAccount.isPending &&
    !submittingRef.current &&
    !statusLoadFailed;

  const formattedDate = gracePeriodEnds
    ? new Date(gracePeriodEnds).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 16,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
      >
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-h1 font-bold text-text-primary">
            {t('account.title')}
          </Text>
          <Pressable
            onPress={handleClose}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            testID="delete-account-close"
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Text className="text-body text-primary font-semibold">
              {t('common.close')}
            </Text>
          </Pressable>
        </View>

        {error !== '' && (
          <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
            <Text
              className="text-danger text-body-sm"
              testID="delete-account-error"
            >
              {error}
            </Text>
          </View>
        )}

        {deletionStatus.isLoading ? (
          <View className="flex-1 items-center justify-center py-10">
            <ActivityIndicator
              color={colors.primary}
              testID="delete-account-status-loading"
            />
          </View>
        ) : statusLoadFailed ? (
          <View testID="delete-account-status-error">
            <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
              <Text className="text-danger text-body-sm">
                {t('errors.networkError')}
              </Text>
            </View>
            <Pressable
              onPress={() => void deletionStatus.refetch()}
              className="bg-primary rounded-button py-3.5 items-center mb-3"
              testID="delete-account-status-retry"
              accessibilityRole="button"
              accessibilityLabel={t('common.retry')}
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('common.retry')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleClose}
              className="bg-surface rounded-button py-3.5 items-center"
              testID="delete-account-status-back"
              accessibilityRole="button"
              accessibilityLabel={t('common.goBack')}
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('common.goBack')}
              </Text>
            </Pressable>
          </View>
        ) : stage === 'scheduled' ? (
          <View testID="delete-account-scheduled">
            <Text className="text-body text-text-primary mb-2">
              {t('account.scheduledTitle')}
            </Text>
            <Text className="text-body text-text-secondary mb-2">
              {t('account.scheduledBody', { date: formattedDate })}
            </Text>
            <Text className="text-body-sm text-text-tertiary mb-6">
              {t('account.scheduledAccountActive')}
            </Text>
            <Pressable
              onPress={() => void onCancelDeletion()}
              disabled={isLoading}
              className="bg-primary rounded-button py-3.5 items-center mb-3"
              testID="delete-account-keep"
              accessibilityRole="button"
              accessibilityLabel={t('account.keepAccountLabel')}
            >
              {cancelDeletion.isPending ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text className="text-body font-semibold text-text-inverse">
                  {t('account.keepAccount')}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() =>
                // UX-DE-H2: surface signOut failure
                void signOutWithCleanup({
                  clerkSignOut: signOut,
                  queryClient,
                  profileIds: profiles.map((p) => p.id),
                }).catch(() => {
                  platformAlert(
                    t('account.signOutFailedTitle'),
                    t('account.signOutFailedMessage'),
                  );
                })
              }
              className="bg-surface rounded-button py-3.5 items-center mb-3"
              testID="delete-account-sign-out"
              accessibilityRole="button"
              accessibilityLabel={t('account.signOutNowLabel')}
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('account.signOutNow')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleClose}
              className="bg-surface rounded-button py-3.5 items-center"
              testID="delete-account-dismiss"
              accessibilityRole="button"
              accessibilityLabel={t('account.closeWithoutCancellingLabel')}
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('common.close')}
              </Text>
            </Pressable>
          </View>
        ) : stage === 'confirming' ? (
          <View testID="delete-account-confirming">
            {/* [BUG-910] Family pool consequences — parents need to know
                that linked child profiles are deleted along with their account. */}
            <View
              className="bg-danger/10 rounded-card px-4 py-3 mb-4"
              testID="delete-account-family-warning"
            >
              <Text className="text-body-sm font-semibold text-danger mb-1">
                {t('account.familyWarningTitle')}
              </Text>
              <Text className="text-body-sm text-text-primary">
                {t('account.familyWarningBody')}
              </Text>
            </View>

            {/* [BUG-910] Active subscription advisory — store-billed plans
                continue to charge unless the user cancels with the platform. */}
            <View
              className="bg-warning/10 rounded-card px-4 py-3 mb-6"
              testID="delete-account-subscription-warning"
            >
              <Text className="text-body-sm font-semibold text-text-primary mb-1">
                {t('account.subscriptionWarningTitle')}
              </Text>
              <Text className="text-body-sm text-text-secondary">
                {t('account.subscriptionWarningBodyPrefix')}{' '}
                <Text className="font-semibold">
                  {t('account.subscriptionWarningNot')}
                </Text>{' '}
                {t('account.subscriptionWarningBodySuffix')}
              </Text>
            </View>

            <Text className="text-body text-text-primary mb-2">
              {t('account.confirmPromptPrefix')}{' '}
              <Text className="font-bold">{DELETE_CONFIRMATION_PHRASE}</Text>{' '}
              {t('account.confirmPromptSuffix')}
            </Text>
            <TextInput
              testID="delete-account-confirm-input"
              accessibilityLabel={t('account.confirmInputLabel', {
                phrase: DELETE_CONFIRMATION_PHRASE,
              })}
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              autoFocus
              className="bg-surface rounded-input border border-border px-4 py-3 mb-4 text-body text-text-primary"
              placeholder={DELETE_CONFIRMATION_PHRASE}
              placeholderTextColor={colors.muted}
              editable={!deleteAccount.isPending}
            />

            <Pressable
              onPress={() => void onConfirmDelete()}
              disabled={!canConfirm}
              className={`rounded-button py-3.5 items-center mb-3 ${
                canConfirm ? 'bg-danger' : 'bg-danger/40'
              }`}
              testID="delete-account-confirm-final"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
              accessibilityLabel={t('account.permanentDeleteLabel')}
            >
              {deleteAccount.isPending ? (
                <ActivityIndicator
                  color={colors.textInverse}
                  testID="delete-account-loading"
                />
              ) : (
                <Text className="text-body font-semibold text-text-inverse">
                  {t('account.permanentDelete')}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={onBackToWarning}
              disabled={deleteAccount.isPending}
              className="bg-surface rounded-button py-3.5 items-center"
              testID="delete-account-back-to-warning"
              accessibilityRole="button"
              accessibilityLabel={t('common.goBack')}
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('common.goBack')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text className="text-body text-text-secondary mb-4">
              {t('account.warningBody1')}
            </Text>
            <Text className="text-body text-text-secondary mb-6">
              {t('account.warningBody2')}
            </Text>

            <Pressable
              onPress={onBeginConfirm}
              disabled={isLoading}
              className="bg-danger rounded-button py-3.5 items-center mb-3"
              testID="delete-account-confirm"
              accessibilityRole="button"
              accessibilityLabel={t('account.understandDeleteLabel')}
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('account.understandDelete')}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleClose}
              className="bg-surface rounded-button py-3.5 items-center"
              testID="delete-account-cancel"
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text className="text-body font-semibold text-text-primary">
                {t('common.cancel')}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}
