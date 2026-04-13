import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeleteAccount, useCancelDeletion } from '../hooks/use-account';
import { useThemeColors } from '../lib/theme';
import { goBackOrReplace } from '../lib/navigation';
import { formatApiError } from '../lib/format-api-error';

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const deleteAccount = useDeleteAccount();
  const cancelDeletion = useCancelDeletion();

  const [gracePeriodEnds, setGracePeriodEnds] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleClose = useCallback(() => {
    goBackOrReplace(router, '/(app)/more');
  }, [router]);

  const onDelete = useCallback(() => {
    Alert.alert(
      'Delete account?',
      'This action is irreversible. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setError('');
            try {
              const result = await deleteAccount.mutateAsync();
              setGracePeriodEnds(result.gracePeriodEnds);
            } catch (err: unknown) {
              setError(formatApiError(err));
            }
          },
        },
      ]
    );
  }, [deleteAccount]);

  const onCancel = useCallback(async () => {
    setError('');
    try {
      await cancelDeletion.mutateAsync();
      handleClose();
    } catch (err: unknown) {
      setError(formatApiError(err));
    }
  }, [cancelDeletion, handleClose]);

  const isLoading = deleteAccount.isPending || cancelDeletion.isPending;

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
            Delete account
          </Text>
          <Pressable
            onPress={handleClose}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            testID="delete-account-close"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text className="text-body text-primary font-semibold">Close</Text>
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

        {gracePeriodEnds ? (
          <View testID="delete-account-scheduled">
            <Text className="text-body text-text-primary mb-2">
              Your account is scheduled for deletion.
            </Text>
            <Text className="text-body text-text-secondary mb-6">
              All your data will be permanently removed on{' '}
              <Text className="font-semibold">{formattedDate}</Text>. You can
              cancel anytime before then.
            </Text>
            <Pressable
              onPress={onCancel}
              disabled={isLoading}
              className="bg-primary rounded-button py-3.5 items-center mb-3"
              testID="delete-account-keep"
              accessibilityRole="button"
              accessibilityLabel="I changed my mind — keep my account"
            >
              {cancelDeletion.isPending ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text className="text-body font-semibold text-text-inverse">
                  I changed my mind — keep my account
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleClose}
              className="bg-surface rounded-button py-3.5 items-center"
              testID="delete-account-dismiss"
              accessibilityRole="button"
              accessibilityLabel="Close without cancelling"
            >
              <Text className="text-body font-semibold text-text-primary">
                Close
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text className="text-body text-text-secondary mb-4">
              This will permanently delete your account and all associated data,
              including profiles, learning progress, and consent records.
            </Text>
            <Text className="text-body text-text-secondary mb-6">
              You'll have a 7-day grace period to change your mind. After that,
              your data cannot be recovered.
            </Text>

            <Pressable
              onPress={onDelete}
              disabled={isLoading}
              className="bg-danger rounded-button py-3.5 items-center mb-3"
              testID="delete-account-confirm"
              accessibilityRole="button"
              accessibilityLabel="I understand, delete my account"
            >
              {deleteAccount.isPending ? (
                <ActivityIndicator
                  color={colors.textInverse}
                  testID="delete-account-loading"
                />
              ) : (
                <Text className="text-body font-semibold text-text-inverse">
                  I understand, delete my account
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleClose}
              className="bg-surface rounded-button py-3.5 items-center"
              testID="delete-account-cancel"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text className="text-body font-semibold text-text-primary">
                Cancel
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}
