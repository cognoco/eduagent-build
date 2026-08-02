import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { VoiceInputControl, appendTranscript } from '../common';

export function DraftedNoteReview({
  initialContent,
  fallbackPrompt,
  onSave,
  onSkip,
  voiceLocale,
}: {
  initialContent: string | null;
  fallbackPrompt?: string;
  onSave: (content: string) => Promise<unknown>;
  onSkip: () => void;
  /** Voice locale for the note-edit mic (WI-2551), resolved by the screen. */
  voiceLocale?: string;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialContent ?? '');
  const [editing, setEditing] = useState(initialContent === null);
  // The mic and save must be inert during the async onSave window — a
  // transcript appended after Save was dispatched would mutate a draft that
  // was already submitted with the original text.
  const [saving, setSaving] = useState(false);
  const trimmedContent = content.trim();
  const canSave = trimmedContent.length > 0 && !saving;
  return (
    <View
      className="rounded-2xl bg-surface-elevated p-4 border border-accent-soft"
      testID="drafted-note-review"
    >
      <Text className="text-text-primary text-base font-semibold mb-2">
        {t('session.challenge.draft.title')}
      </Text>
      {fallbackPrompt ? (
        <Text
          className="text-text-secondary mb-2"
          testID="drafted-note-fallback-prompt"
        >
          {fallbackPrompt}
        </Text>
      ) : null}
      {editing ? (
        <>
          <TextInput
            multiline
            value={content}
            onChangeText={setContent}
            placeholder={fallbackPrompt}
            className="text-text-primary min-h-[120px] rounded-xl bg-surface p-3"
            testID="drafted-note-input"
          />
          <View className="mt-2">
            <VoiceInputControl
              value={content}
              disabled={saving}
              voiceLocale={voiceLocale}
              testID="drafted-note-mic"
              onTranscript={(finalTranscript) =>
                setContent((prev) => appendTranscript(prev, finalTranscript))
              }
            />
          </View>
        </>
      ) : (
        <Text className="text-text-primary" testID="drafted-note-preview">
          {content}
        </Text>
      )}
      <View className="flex-row gap-2 mt-3 flex-wrap">
        <Pressable
          onPress={() => {
            if (!canSave) return;
            setSaving(true);
            void (async () => {
              try {
                await onSave(trimmedContent);
              } catch {
                // The caller owns user-facing error copy (as with the
                // pre-existing fire-and-forget call); the draft is kept so
                // the learner can retry.
              } finally {
                setSaving(false);
              }
            })();
          }}
          disabled={!canSave}
          className={`rounded-xl px-4 py-2 ${
            canSave ? 'bg-accent' : 'bg-surface'
          }`}
          accessibilityState={{ disabled: !canSave }}
          testID="drafted-note-save"
        >
          <Text
            className={
              canSave ? 'text-on-accent font-medium' : 'text-text-muted'
            }
          >
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
