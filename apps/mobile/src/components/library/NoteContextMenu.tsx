import { Alert } from 'react-native';

interface NoteContextMenuProps {
  noteId: string;
  content: string;
  onEdit: (noteId: string, currentContent: string) => void;
  onDelete: (noteId: string) => void;
}

export function showNoteContextMenu({
  noteId,
  content,
  onEdit,
  onDelete,
}: NoteContextMenuProps) {
  Alert.alert('Note', undefined, [
    { text: 'Edit', onPress: () => onEdit(noteId, content) },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => {
        Alert.alert('Delete this note?', "This can't be undone.", [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => onDelete(noteId),
          },
        ]);
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
