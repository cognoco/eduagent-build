import { Platform } from 'react-native';
import { platformAlert } from '../../lib/platform-alert';

interface NoteContextMenuProps {
  noteId: string;
  content: string;
  onEdit: (noteId: string, currentContent: string) => void;
  onDelete: (noteId: string) => void;
  /** Optional i18n translate function — if omitted, falls back to key passthrough. */
  t?: (key: string) => string;
}

/**
 * Confirm-then-delete. Extracted so both the native menu path and the web
 * fallback reuse the same confirmation copy.
 */
function confirmDelete({
  noteId,
  onDelete,
  t,
}: Pick<NoteContextMenuProps, 'noteId' | 'onDelete'> & {
  t: (key: string) => string;
}): void {
  platformAlert(
    t('library.noteMenu.deleteTitle'),
    t('library.noteMenu.deleteMessage'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => onDelete(noteId),
      },
    ],
  );
}

/**
 * [#5] Context menu for an inline note. Routed through `platformAlert` so it
 * works on web (raw `Alert.alert` is a no-op on web). On web, `platformAlert`
 * only supports a 2-button confirm, so we map the 3-way menu (Edit / Delete /
 * Cancel) onto a confirm: "Edit?" — OK edits, Cancel offers a delete confirm.
 * On native the full 3-button action sheet is preserved.
 */
export function showNoteContextMenu({
  noteId,
  content,
  onEdit,
  onDelete,
  t = (key) => key,
}: NoteContextMenuProps) {
  if (Platform.OS === 'web') {
    // Web `confirm` is binary (OK / Cancel) and shows only the message text, so
    // the prompt copy spells out what each choice does: OK edits, Cancel routes
    // to a delete confirmation. Both edit and delete stay reachable on web —
    // no dead-end — even though there is no native 3-button action sheet.
    platformAlert(
      t('library.noteMenu.title'),
      t('library.noteMenu.webEditPrompt'),
      [
        {
          text: t('common.edit'),
          onPress: () => onEdit(noteId, content),
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
          onPress: () => confirmDelete({ noteId, onDelete, t }),
        },
      ],
    );
    return;
  }

  platformAlert(t('library.noteMenu.title'), undefined, [
    { text: t('common.edit'), onPress: () => onEdit(noteId, content) },
    {
      text: t('common.delete'),
      style: 'destructive',
      onPress: () => confirmDelete({ noteId, onDelete, t }),
    },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}
