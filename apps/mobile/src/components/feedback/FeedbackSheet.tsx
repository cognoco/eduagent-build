import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedbackCategory } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';
import { useFeedbackSubmit } from '../../hooks/use-feedback';
import { formatApiError } from '../../lib/format-api-error';
import { platformAlert } from '../../lib/platform-alert';

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other', label: 'Other' },
];

interface FeedbackSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function FeedbackSheet({
  visible,
  onClose,
}: FeedbackSheetProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const submit = useFeedbackSubmit();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');

  const canSubmit = message.trim().length > 0 && !submit.isPending;

  function handleClose() {
    setMessage('');
    setCategory('bug');
    submit.reset();
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    submit.mutate(
      {
        category,
        message: message.trim(),
        appVersion: Constants.expoConfig?.version ?? undefined,
        platform: Platform.OS as 'ios' | 'android' | 'web',
        osVersion: Platform.Version?.toString(),
      },
      {
        onSuccess: () => {
          platformAlert(
            'Thank you!',
            "We've received your feedback and will look into it.",
            [{ text: 'OK', onPress: handleClose }]
          );
        },
        onError: (err) => {
          platformAlert('Could not send feedback', formatApiError(err));
        },
      }
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      testID="feedback-modal"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <Pressable
            onPress={handleClose}
            className="min-w-[44px] min-h-[44px] justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="feedback-close"
          >
            <Text className="text-primary text-body font-semibold">Cancel</Text>
          </Pressable>
          <Text className="text-h2 font-bold text-text-primary">
            Report a Problem
          </Text>
          <View style={{ minWidth: 44 }} />
        </View>

        <View className="flex-1 px-5 pt-4">
          <Text className="text-body-sm font-semibold text-text-secondary mb-2">
            What kind of feedback?
          </Text>
          <View className="flex-row gap-2 mb-5">
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.value}
                onPress={() => setCategory(cat.value)}
                className={`flex-1 py-2.5 rounded-button items-center ${
                  category === cat.value
                    ? 'bg-primary'
                    : 'bg-surface border border-border'
                }`}
                accessibilityRole="radio"
                accessibilityState={{ selected: category === cat.value }}
                testID={`feedback-category-${cat.value}`}
              >
                <Text
                  className={`text-body-sm font-semibold ${
                    category === cat.value
                      ? 'text-text-inverse'
                      : 'text-text-primary'
                  }`}
                >
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="text-body-sm font-semibold text-text-secondary mb-2">
            Tell us what happened
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-card px-4 py-3 min-h-[140px]"
            style={{ textAlignVertical: 'top' }}
            placeholder="Describe the issue or your idea..."
            placeholderTextColor={colors.muted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
            autoFocus
            editable={!submit.isPending}
            testID="feedback-message-input"
          />
          <Text className="text-caption text-text-muted mt-1 text-right">
            {message.length}/2000
          </Text>

          <Text className="text-caption text-text-muted mt-4">
            We&apos;ll also include your app version and device info to help us
            investigate.
          </Text>
        </View>

        <View className="px-5 pb-4">
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            className={`rounded-button py-3.5 items-center ${
              canSubmit ? 'bg-primary' : 'bg-primary/40'
            }`}
            accessibilityRole="button"
            accessibilityLabel="Send feedback"
            testID="feedback-submit"
          >
            {submit.isPending ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text className="text-body font-semibold text-text-inverse">
                Send Feedback
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
