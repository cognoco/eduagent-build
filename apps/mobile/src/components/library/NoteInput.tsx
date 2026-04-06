import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';

const MAX_CHARS = 2000;
const WARN_THRESHOLD = 1800;

interface NoteInputProps {
  onSave: (content: string) => void;
  onCancel: () => void;
  initialValue?: string;
  saving?: boolean;
}

export function NoteInput({
  onSave,
  onCancel,
  initialValue = '',
  saving = false,
}: NoteInputProps): React.ReactElement {
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
        placeholder="Write your note..."
        placeholderTextColor={themeColors.textSecondary}
        multiline
        maxLength={MAX_CHARS}
        className="text-body text-text-primary min-h-24 mb-2"
        accessibilityLabel="Note text"
      />

      {isNearLimit && (
        <Text className="text-caption text-warning mb-2">
          {`Your note is getting long! (${text.length}/${MAX_CHARS})`}
        </Text>
      )}

      {isListening && (
        <View className="flex-row items-center mb-2">
          <ActivityIndicator size="small" color={themeColors.primary} />
          <Text className="text-caption text-text-secondary ms-2">
            Listening...
          </Text>
        </View>
      )}

      <View className="flex-row items-center justify-between">
        <Pressable
          testID="note-mic-button"
          onPress={handleMicPress}
          className="p-2"
          accessibilityLabel={
            isListening ? 'Stop recording' : 'Start recording'
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
            accessibilityLabel="Cancel"
          >
            <Text className="text-body text-text-secondary">Cancel</Text>
          </Pressable>

          <Pressable
            onPress={() => onSave(text)}
            disabled={isEmpty || saving}
            className="px-4 py-2 bg-primary rounded-md"
            accessibilityLabel="Save note"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-body text-text-primary">Save</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
