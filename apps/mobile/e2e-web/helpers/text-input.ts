import { expect, type Locator } from '@playwright/test';

export async function fillTextInput(
  target: Locator,
  value: string,
): Promise<void> {
  await expect(target).toBeVisible({ timeout: 30_000 });
  await target.evaluate((element, nextValue) => {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      throw new Error('fillTextInput target must be an input or textarea');
    }

    element.focus();

    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(
      prototype,
      'value',
    )?.set;
    if (!valueSetter) {
      throw new Error('Unable to find native value setter for text input');
    }

    valueSetter.call(element, nextValue);
    const inputEvent =
      typeof InputEvent === 'function'
        ? new InputEvent('input', {
            bubbles: true,
            data: nextValue,
            inputType: 'insertText',
          })
        : new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(target).toHaveValue(value, { timeout: 5_000 });
}
