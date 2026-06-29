import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../lib/theme';
import { VoiceRecordButton } from '../session/VoiceRecordButton';
import type { SubjectHubNote } from './_view-models/subject-hub-state';

type NoteOrigin = SubjectHubNote['origin'];

// Transcription-only contract (spec §16 / AI Act Art 5(1)(f)): the note mic only
// ever requests speech-to-text. It never analyses tone or emotion. Mirrors the
// search mic's SubjectHubVoiceRequest so both surfaces carry the same invariant.
export interface SubjectHubNotesVoiceRequest {
  kind: 'transcription';
  source: 'subject-hub-notes';
  analyzesTone: false;
  analyzesEmotion: false;
}

interface SubjectHubNotesSectionProps {
  notes: SubjectHubNote[];
  // Driven by the data, never by a client persona/ownership read (spec §6.3).
  // The masked supporter scope hands canStudy=false → no add input, no mic.
  canStudy?: boolean;
  onAddNote?: (content: string) => void;
  onNoteVoice?: (request: SubjectHubNotesVoiceRequest) => void;
}

// The add affordance (input + empty-state add button) is shown only when the
// learner can study AND a persistence handler (`onAddNote`) is actually wired.
// Notes are topic-scoped (persisted via `useCreateNote`), so authoring is wired
// only where a focused topic exists: the `TopicDetailSheet` passes `onAddNote`
// bound to the open topic, while the subject-level mount in `SubjectHub` passes
// none — there is no single topic to bind to, so it stays read-only (felt-knowing
// loop spec, Flow 1 / Failure Modes: "no focused topic → no add input"). Showing
// an add input with no handler would silently discard what the user typed — a
// dead-end worse than no input at all. See PR #1316 / claude-review MUST_FIX.
// The transcription mic renders only when an `onNoteVoice` handler is wired; with
// no handler it would be a dead button, so it is gated out rather than shown inert.

const NOTE_ORIGINS: NoteOrigin[] = ['self', 'mentor'];

function noteOriginLabel(origin: NoteOrigin) {
  return origin === 'self'
    ? 'subjectHub.notes.authorSelf'
    : 'subjectHub.notes.authorMentor';
}

export function SubjectHubNotesSection({
  notes,
  canStudy = true,
  onAddNote,
  onNoteVoice,
}: SubjectHubNotesSectionProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [selectedOrigin, setSelectedOrigin] = useState<NoteOrigin>('self');
  const [draft, setDraft] = useState('');
  const notesByOrigin = useMemo(
    () => ({
      self: notes.filter((note) => note.origin === 'self'),
      mentor: notes.filter((note) => note.origin === 'mentor'),
    }),
    [notes],
  );
  const visibleNotes = notesByOrigin[selectedOrigin];
  const isEmpty = notes.length === 0;
  // Only offer adding a note when something can actually persist it.
  const canAddNote = canStudy && !!onAddNote;
  const hasDraftText = draft.trim().length > 0;

  const submitDraft = () => {
    if (!onAddNote) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setDraft('');
  };

  return (
    <View
      testID="subject-hub-notes-section"
      className="mt-5 rounded-card bg-surface p-4"
    >
      <Text className="text-caption font-semibold uppercase text-text-secondary">
        {t('subjectHub.notes.heading')}
      </Text>

      {/* Add-note input + transcription-only voice mic. Rendered only when the
          learner Me-scope can study AND a persistence handler is wired; the masked
          supporter view (canStudy=false) and the persistence-deferred hub render
          neither. */}
      {canAddNote ? (
        <View
          testID="subject-hub-notes-add-row"
          className="mt-3 flex-row items-center rounded-card border border-border bg-surface-elevated px-3"
        >
          <TextInput
            testID="subject-hub-notes-input"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submitDraft}
            placeholder={t('subjectHub.notes.addNote')}
            placeholderTextColor={colors.textSecondary}
            className="min-h-12 flex-1 text-body text-text-primary"
          />
          {/* The pressable carries testID `notes-mic`; the reused
              VoiceRecordButton supplies the transcription-only mic visual.
              The inner button's own onPress is a no-op so the request fires
              exactly once, from the notes-mic pressable. Rendered only when an
              `onNoteVoice` handler is wired — otherwise the mic would do nothing. */}
          {onNoteVoice ? (
            <Pressable
              testID="notes-mic"
              accessibilityRole="button"
              accessibilityLabel={t('subjectHub.notes.micLabel')}
              className="ms-2"
              onPress={() =>
                onNoteVoice({
                  kind: 'transcription',
                  source: 'subject-hub-notes',
                  analyzesTone: false,
                  analyzesEmotion: false,
                })
              }
            >
              <View pointerEvents="none">
                <VoiceRecordButton
                  isListening={false}
                  onPress={() => undefined}
                />
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {isEmpty ? (
        <View testID="subject-hub-notes-empty" className="mt-4 items-center">
          <Text className="text-center text-body-sm text-text-secondary">
            {t('subjectHub.notes.empty')}
          </Text>
          {canAddNote ? (
            <Pressable
              testID="subject-hub-notes-empty-add"
              accessibilityRole="button"
              accessibilityLabel={t('subjectHub.notes.addNote')}
              accessibilityState={{ disabled: !hasDraftText }}
              disabled={!hasDraftText}
              onPress={submitDraft}
              className={`mt-3 min-h-[44px] items-center justify-center rounded-button bg-surface-elevated px-5 ${
                hasDraftText ? '' : 'opacity-50'
              }`}
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('subjectHub.notes.addNote')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <View
            className="mt-3 flex-row rounded-card bg-surface-elevated p-1"
            testID="subject-hub-notes-tabs"
          >
            {NOTE_ORIGINS.map((origin) => {
              const selected = selectedOrigin === origin;
              return (
                <Pressable
                  key={origin}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedOrigin(origin)}
                  testID={`subject-hub-notes-${origin}`}
                  className={`min-h-[36px] flex-1 items-center justify-center rounded-card px-2 ${
                    selected ? 'bg-surface' : ''
                  }`}
                >
                  <Text
                    numberOfLines={1}
                    className={`text-caption font-semibold ${
                      selected ? 'text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    {t(noteOriginLabel(origin))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {visibleNotes.map((note) => (
            <View key={note.id} className="mt-3 border-t border-border pt-3">
              <Text className="text-caption font-semibold text-text-secondary">
                {note.authorLabel}
              </Text>
              <Text className="mt-1 text-body-sm text-text-primary">
                {note.content}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
