/**
 * @jest-environment ./apps/mobile/jest.web-environment.cjs
 */
/// <reference lib="dom" />

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Button } from './Button';

jest.mock('react-native', () => jest.requireActual('react-native-web'));
jest.mock('nativewind', () => ({ vars: (value: unknown) => value }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Button web keyboard accessibility', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  it('[WI-2183 a11y] keeps Retry feedback keyboard-activatable through native web button semantics', async () => {
    const onRetry = jest.fn();
    await act(async () => {
      root.render(<Button label="Retry feedback" onPress={onRetry} />);
    });

    const retryButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Retry feedback"]',
    );
    expect(retryButton).not.toBeNull();
    expect(retryButton?.tabIndex).toBe(0);
    expect(retryButton?.disabled).toBe(false);

    await act(async () => retryButton?.focus());
    expect(document.activeElement).toBe(retryButton);
    await act(async () => retryButton?.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
