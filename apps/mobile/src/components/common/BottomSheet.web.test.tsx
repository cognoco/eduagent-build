/**
 * @jest-environment ./apps/mobile/jest.web-environment.cjs
 */
/// <reference lib="dom" />

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Pressable, Text } from 'react-native';

import { BottomSheet } from './BottomSheet';

jest.mock('react-native', () => jest.requireActual('react-native-web'));

describe('BottomSheet web accessibility structure', () => {
  let host: HTMLDivElement;
  let opener: HTMLButtonElement;
  let root: Root;

  beforeEach(() => {
    document.body.replaceChildren();
    opener = document.createElement('button');
    opener.textContent = 'Open topic picker';
    document.body.append(opener);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    opener.focus();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  it('[WI-2182] uses the real web Modal as one named dialog with sibling backdrop and surface', async () => {
    const onClose = jest.fn();
    const onAction = jest.fn();

    await act(async () => {
      root.render(
        <BottomSheet
          visible
          onClose={onClose}
          backdropDismissible
          backdropAccessibilityLabel="Close topic picker"
          accessibilityLabel="Topic picker"
          animationType="none"
          testID="sheet-surface"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose Algebra"
            onPress={onAction}
          >
            <Text>Choose Algebra</Text>
          </Pressable>
          <input aria-label="Topic note" />
        </BottomSheet>,
      );
    });

    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    expect(dialogs).toHaveLength(1);
    const dialog = dialogs.item(0);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Topic picker');

    const backdrop = document.querySelector<HTMLElement>(
      '[aria-label="Close topic picker"]',
    );
    const surface = document.querySelector<HTMLElement>(
      '[data-testid="sheet-surface"]',
    );
    const action = document.querySelector<HTMLElement>(
      '[aria-label="Choose Algebra"]',
    );
    const input = document.querySelector<HTMLInputElement>(
      '[aria-label="Topic note"]',
    );

    expect(backdrop).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(action).not.toBeNull();
    expect(input).not.toBeNull();
    expect(backdrop?.tagName).toBe('BUTTON');
    expect(action?.tagName).toBe('BUTTON');
    expect(backdrop?.parentElement).toBe(surface?.parentElement);
    expect(backdrop?.contains(surface ?? null)).toBe(false);
    expect(backdrop?.contains(action ?? null)).toBe(false);
    expect(dialog.contains(document.activeElement)).toBe(true);

    onClose.mockClear();
    await act(async () => backdrop!.click());
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keyup', { bubbles: true, key: 'Escape' }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    await act(async () => action!.click());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () =>
      input!.dispatchEvent(new Event('input', { bubbles: true })),
    );
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => opener.focus());
    expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
    root = createRoot(host);
  });
});
