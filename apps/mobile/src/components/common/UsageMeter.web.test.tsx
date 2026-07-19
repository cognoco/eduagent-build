/**
 * @jest-environment ./apps/mobile/jest.web-environment.cjs
 */
/// <reference lib="dom" />

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { UsageMeter } from './UsageMeter';

jest.mock('react-native', () => jest.requireActual('react-native-web'));

describe('UsageMeter web accessibility', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  it('[WI-2194] exposes the bounded usage range and clamps an over-limit value', async () => {
    await act(async () => {
      root.render(
        <UsageMeter used={1_750} limit={1_500} warningLevel="hard" />,
      );
    });

    const meter = host.querySelector<HTMLElement>('[role="progressbar"]');

    expect(meter).not.toBeNull();
    expect(meter?.getAttribute('aria-valuemin')).toBe('0');
    expect(meter?.getAttribute('aria-valuemax')).toBe('1500');
    expect(meter?.getAttribute('aria-valuenow')).toBe('1500');
  });
});
