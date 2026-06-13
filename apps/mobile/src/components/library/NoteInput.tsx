import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';

const MAX_CHARS = 5000;
const WARN_THRESHOLD = 4500;

interface NoteInputProps {
  onSave: (content: string) => void;
  onCancel: () => void;
  initialValue?: string;
  placeholder?: string;
  saving?: boolean;
}

export function NoteInput({
  onSave,
  onCancel,
  initialValue = '',
  placeholder = 'Write your note...',
  saving = false,
}: NoteInputProps): React.ReactElement {
  const { t } = useTranslation();
  const themeColors = useThemeColors();
  const [text, setText] = useState(initialValue);
  const { isListening, transcript, startListening, stopListening } =
    useSpeechRecognition();

  // Append transcript to text when a new transcript arrives after listening
  const [prevTranscript, setPrevTranscript] = useState('');
  useEffect(() => {
    if (transcript && transcript !== prevTranscript) {
      if (!isListening) {
        // Listening stopped and we have a new transcript — append it
        setText((prev) => {
          const separator = prev.trim() ? ' ' : '';
          return prev + separator + transcript;
        });
      }
      setPrevTranscript(transcript);
    }
  }, [transcript, isListening, prevTranscript]);

  const handleMicPress = async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  };

  const isNearLimit = text.length >= WARN_THRESHOLD;
  const isEmpty = text.trim().length === 0;

  return (
    <View className="bg-surface-elevated rounded-lg p-3">
      <TextInput
        testID="note-text-input"
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={themeColors.textSecondary}
        multiline
        maxLength={MAX_CHARS}
        className="text-body text-text-primary min-h-24 mb-2"
        accessibilityLabel={t('session.noteInput.noteText')}
      />

      {isNearLimit && (
        <Text className="text-caption text-warning mb-2">
          {t('session.noteInput.noteTooLong', {
            length: text.length,
            max: MAX_CHARS,
          })}
        </Text>
      )}

      {isListening && (
        <View className="flex-row items-center mb-2">
          <ActivityIndicator
            size="small"
            color={themeColors.primary}
            accessibilityLabel={t('common.loading')}
          />
          <Text className="text-caption text-text-secondary ms-2">
            {t('session.noteInput.listening')}
          </Text>
        </View>
      )}

      <View className="flex-row items-center justify-between">
        <Pressable
          testID="note-mic-button"
          onPress={handleMicPress}
          className="p-2"
          accessibilityRole="button"
          accessibilityState={{ selected: isListening }}
          accessibilityLabel={
            isListening
              ? t('session.noteInput.stopRecording')
              : t('session.noteInput.startRecording')
          }
        >
          <Ionicons
            name={isListening ? 'mic' : 'mic-outline'}
            size={22}
            color={
              isListening ? themeColors.primary : themeColors.textSecondary
            }
          />
        </Pressable>

        <View className="flex-row gap-2">
          <Pressable
            onPress={onCancel}
            className="px-4 py-2"
            accessibilityRole="button"
            accessibilityLabel={t('session.noteInput.cancel')}
          >
            <Text className="text-body text-text-secondary">
              {t('session.noteInput.cancel')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onSave(text)}
            disabled={isEmpty || saving}
            className="px-4 py-2 bg-primary rounded-md"
            accessibilityRole="button"
            accessibilityState={{ disabled: isEmpty || saving }}
            accessibilityLabel={t('session.noteInput.save')}
          >
            {saving ? (
              <ActivityIndicator
                size="small"
                color={themeColors.textInverse}
                accessibilityLabel={t('common.loading')}
              />
            ) : (
              <Text className="text-body text-text-primary">
                {t('session.noteInput.save')}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
