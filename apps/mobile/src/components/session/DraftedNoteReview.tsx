import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export function DraftedNoteReview({
  initialContent,
  onSave,
  onSkip,
}: {
  initialContent: string;
  onSave: (content: string) => Promise<unknown>;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialContent);
  const [editing, setEditing] = useState(false);
  return (
    <View
      className="rounded-2xl bg-surface-elevated p-4 border border-accent-soft"
      testID="drafted-note-review"
    >
      <Text className="text-text-primary text-base font-semibold mb-2">
        {t('session.challenge.draft.title')}
      </Text>
      {editing ? (
        <TextInput
          multiline
          value={content}
          onChangeText={setContent}
          className="text-text-primary min-h-[120px] rounded-xl bg-surface p-3"
          testID="drafted-note-input"
        />
      ) : (
        <Text className="text-text-primary" testID="drafted-note-preview">
          {content}
        </Text>
      )}
      <View className="flex-row gap-2 mt-3 flex-wrap">
        <Pressable
          onPress={() => onSave(content)}
          className="bg-accent rounded-xl px-4 py-2"
          testID="drafted-note-save"
        >
          <Text className="text-on-accent font-medium">
            {t('session.challenge.draft.save')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setEditing(true)}
          className="bg-surface rounded-xl px-4 py-2"
          testID="drafted-note-edit"
        >
          <Text className="text-text-primary">
            {t('session.challenge.draft.edit')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onSkip}
          className="rounded-xl px-4 py-2"
          testID="drafted-note-skip"
        >
          <Text className="text-text-muted">
            {t('session.challenge.draft.skip')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
