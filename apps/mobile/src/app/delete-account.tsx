import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeleteAccount, useCancelDeletion } from '../hooks/use-account';

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const deleteAccount = useDeleteAccount();
  const cancelDeletion = useCancelDeletion();

  const [gracePeriodEnds, setGracePeriodEnds] = useState<string | null>(null);
  const [error, setError] = useState('');

  const onDelete = useCallback(async () => {
    setError('');
    try {
      const result = await deleteAccount.mutateAsync();
      setGracePeriodEnds(result.gracePeriodEnds);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
    }
  }, [deleteAccount]);

  const onCancel = useCallback(async () => {
    setError('');
    try {
      await cancelDeletion.mutateAsync();
      router.back();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
    }
  }, [cancelDeletion, router]);

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
            onPress={() => router.back()}
            testID="delete-account-close"
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
            >
              {cancelDeletion.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-body font-semibold text-text-inverse">
                  I changed my mind — keep my account
                </Text>
              )}
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
            >
              {deleteAccount.isPending ? (
                <ActivityIndicator
                  color="#ffffff"
                  testID="delete-account-loading"
                />
              ) : (
                <Text className="text-body font-semibold text-text-inverse">
                  I understand, delete my account
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.back()}
              className="bg-surface rounded-button py-3.5 items-center"
              testID="delete-account-cancel"
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
