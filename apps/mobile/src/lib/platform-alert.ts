/**
 * Cross-platform alert utility.
 *
 * [F-029] On React Native Web, `Alert.alert` from `react-native` is a no-op
 * shim that silently returns without rendering UI or invoking callbacks. This
 * leaves users stuck whenever Alert.alert is used for confirmations (e.g.,
 * "End Session?" or "Are you sure?") because `isClosing` or similar state
 * never gets reset.
 *
 * This utility wraps Alert.alert with a Platform.OS === 'web' branch that
 * uses `win.confirm()` / `win.alert()` as a fallback. It's not a
 * perfect parity (no 3+ button support, no custom styling) but it unblocks
 * the critical confirm/cancel flows on web.
 *
 * Usage: Drop-in replacement for `Alert.alert(title, message, buttons, options)`.
 */
import { Alert, Platform } from 'react-native';

// window.alert/confirm exist at runtime on web but aren't typed in RN's TS config
const win = globalThis as unknown as {
  alert: (msg: string) => void;
  confirm: (msg: string) => boolean;
};

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

export function platformAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons, options);
    return;
  }

  const fullMessage = `${title}${message ? '\n\n' + message : ''}`;

  // Single button or no buttons: simple window.alert
  if (!buttons || buttons.length <= 1) {
    win.alert(fullMessage);
    buttons?.[0]?.onPress?.();
    return;
  }

  // Two+ buttons: use window.confirm.
  // The "cancel"-styled button maps to the Cancel action; the other to OK.
  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const actionButton = cancelButton
    ? buttons.find((b) => b !== cancelButton)
    : buttons[buttons.length - 1];
  const dismissButton = cancelButton ?? buttons[0];

  const confirmed = win.confirm(fullMessage);

  if (confirmed) {
    actionButton?.onPress?.();
  } else {
    dismissButton?.onPress?.();
    options?.onDismiss?.();
  }
}
