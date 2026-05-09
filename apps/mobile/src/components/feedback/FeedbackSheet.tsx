import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = message.trim().length > 0 && !submit.isPending;

  function handleClose() {
    setMessage('');
    setCategory('bug');
    setSubmitted(false);
    setError('');
    submit.reset();
    onClose();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setError('');
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
          setSubmitted(true);
        },
        onError: (err) => {
          setError(formatApiError(err));
        },
      },
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
        // [BUG-516] RN Web's Modal sets pointer-events:none on its root
        // container and never toggles it back when visible. Force 'auto' so
        // all child elements are interactive on web.
        style={{
          pointerEvents: 'auto',
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
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
            Give us feedback now!
          </Text>
          <View style={{ minWidth: 44 }} />
        </View>
        {Platform.OS !== 'web' && (
          <Text
            className="text-body-sm font-bold text-secondary text-center px-5 pb-2"
            testID="feedback-shake-hint"
          >
            Or shake your phone anytime to contact us.
          </Text>
        )}

        {submitted ? (
          <View className="flex-1 items-center justify-center px-5">
            <Text className="text-h2 font-bold text-text-primary mb-2">
              Thank you!
            </Text>
            <Text className="text-body text-text-secondary text-center mb-6">
              We&apos;ve received your feedback and will look into it.
            </Text>
            <Pressable
              onPress={handleClose}
              className="bg-primary rounded-button py-3.5 px-8"
              accessibilityRole="button"
              testID="feedback-done"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Done
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* [BUG-507] ScrollView so content doesn't push Send button off-screen */}
            <ScrollView
              className="flex-1 px-5 pt-4"
              keyboardShouldPersistTaps="handled"
            >
              <Text className="text-body-sm font-semibold text-text-secondary mb-2">
                What kind of feedback?
              </Text>
              <View className="flex-row gap-2 mb-5">
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.value}
                    onPress={() => setCategory(cat.value)}
                    className={`flex-1 py-2.5 rounded-button items-center px-1 ${
                      category === cat.value
                        ? 'bg-primary'
                        : 'bg-surface border border-border'
                    }`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: category === cat.value }}
                    testID={`feedback-category-${cat.value}`}
                  >
                    {/* [BUG-506] numberOfLines prevents clipping on narrow viewports */}
                    <Text
                      numberOfLines={1}
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
                We&apos;ll also include your app version and device info to help
                us investigate.
              </Text>
            </ScrollView>

            <View className="px-5 pb-4">
              {error !== '' && (
                <View className="bg-danger/10 rounded-card px-4 py-3 mb-3">
                  <Text className="text-danger text-body-sm">{error}</Text>
                </View>
              )}
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
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
