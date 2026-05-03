import { Alert } from 'react-native';
import { showNoteContextMenu } from './NoteContextMenu';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a button's onPress from a captured Alert.alert call by button text. */
function getButtonPress(
  alertSpy: jest.SpyInstance,
  callIndex: number,
  buttonText: string
): (() => void) | undefined {
  const buttons: Array<{ text: string; onPress?: () => void }> =
    alertSpy.mock.calls[callIndex][2];
  return buttons.find((b) => b.text === buttonText)?.onPress;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('showNoteContextMenu', () => {
  let alertSpy: jest.SpyInstance;
  let onEdit: jest.Mock;
  let onDelete: jest.Mock;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    onEdit = jest.fn();
    onDelete = jest.fn();
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('calls Alert.alert with title and 3 buttons (Edit, Delete, Cancel)', () => {
    showNoteContextMenu({ noteId: 'n1', content: 'Hello', onEdit, onDelete });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('library.noteMenu.title');
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b: { text: string }) => b.text)).toEqual([
      'common.edit',
      'common.delete',
      'common.cancel',
    ]);
  });

  it('pressing Edit calls onEdit with noteId and content', () => {
    showNoteContextMenu({
      noteId: 'n1',
      content: 'My note text',
      onEdit,
      onDelete,
    });

    const editPress = getButtonPress(alertSpy, 0, 'common.edit');
    editPress?.();

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith('n1', 'My note text');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('pressing Delete shows a confirmation alert', () => {
    showNoteContextMenu({ noteId: 'n1', content: 'Hello', onEdit, onDelete });

    const deletePress = getButtonPress(alertSpy, 0, 'common.delete');
    deletePress?.();

    expect(alertSpy).toHaveBeenCalledTimes(2);
    const [confirmTitle] = alertSpy.mock.calls[1];
    expect(confirmTitle).toBe('library.noteMenu.deleteTitle');
  });

  it('confirming delete calls onDelete with noteId', () => {
    showNoteContextMenu({ noteId: 'n1', content: 'Hello', onEdit, onDelete });

    // Trigger the primary Delete button → opens confirmation alert
    getButtonPress(alertSpy, 0, 'common.delete')?.();

    // Trigger the "Delete" button inside the confirmation alert (call index 1)
    const confirmPress = getButtonPress(alertSpy, 1, 'common.delete');
    confirmPress?.();

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('n1');
  });

  it('cancelling the confirmation does not call onDelete', () => {
    showNoteContextMenu({ noteId: 'n1', content: 'Hello', onEdit, onDelete });

    getButtonPress(alertSpy, 0, 'common.delete')?.();

    // Cancel in the confirmation dialog has no onPress (style: 'cancel')
    const confirmButtons: Array<{ text: string; onPress?: () => void }> =
      alertSpy.mock.calls[1][2];
    const cancelButton = confirmButtons.find((b) => b.text === 'common.cancel');
    // React Native style:'cancel' buttons have no onPress; pressing them is a no-op
    expect(cancelButton?.onPress).toBeUndefined();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('pressing Cancel on the main menu does not call onEdit or onDelete', () => {
    showNoteContextMenu({ noteId: 'n1', content: 'Hello', onEdit, onDelete });

    // The main Cancel button is style:'cancel' with no onPress
    const mainButtons: Array<{ text: string; onPress?: () => void }> =
      alertSpy.mock.calls[0][2];
    const cancelButton = mainButtons.find((b) => b.text === 'common.cancel');
    expect(cancelButton?.onPress).toBeUndefined();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
