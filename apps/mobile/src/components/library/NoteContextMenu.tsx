import { Alert } from 'react-native';

interface NoteContextMenuProps {
  noteId: string;
  content: string;
  onEdit: (noteId: string, currentContent: string) => void;
  onDelete: (noteId: string) => void;
  /** Optional i18n translate function — if omitted, falls back to key passthrough. */
  t?: (key: string) => string;
}

export function showNoteContextMenu({
  noteId,
  content,
  onEdit,
  onDelete,
  t = (key) => key,
}: NoteContextMenuProps) {
  Alert.alert(t('library.noteMenu.title'), undefined, [
    { text: t('common.edit'), onPress: () => onEdit(noteId, content) },
    {
      text: t('common.delete'),
      style: 'destructive',
      onPress: () => {
        Alert.alert(
          t('library.noteMenu.deleteTitle'),
          t('library.noteMenu.deleteMessage'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.delete'),
              style: 'destructive',
              onPress: () => onDelete(noteId),
            },
          ]
        );
      },
    },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}
