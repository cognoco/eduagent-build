import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SubjectHubNote } from './_view-models/subject-hub-state';

type NoteOrigin = SubjectHubNote['origin'];

interface SubjectHubNotesSectionProps {
  notes: SubjectHubNote[];
}

const NOTE_ORIGINS: NoteOrigin[] = ['self', 'mentor'];

function noteOriginLabel(origin: NoteOrigin) {
  return origin === 'self'
    ? 'subjectHub.notes.authorSelf'
    : 'subjectHub.notes.authorMentor';
}

export function SubjectHubNotesSection({
  notes,
}: SubjectHubNotesSectionProps): React.ReactElement {
  const { t } = useTranslation();
  const [selectedOrigin, setSelectedOrigin] = useState<NoteOrigin>('self');
  const notesByOrigin = useMemo(
    () => ({
      self: notes.filter((note) => note.origin === 'self'),
      mentor: notes.filter((note) => note.origin === 'mentor'),
    }),
    [notes],
  );
  const visibleNotes = notesByOrigin[selectedOrigin];

  return (
    <View
      testID="subject-hub-notes-section"
      className="mt-5 rounded-card bg-surface p-4"
    >
      <Text className="text-caption font-semibold uppercase text-text-secondary">
        {t('subjectHub.notes.heading')}
      </Text>
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
    </View>
  );
}
