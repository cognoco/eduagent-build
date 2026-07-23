import { expect as playwrightExpect, type Locator } from '@playwright/test';
import { pressableClick } from './pressable';

jest.mock('@playwright/test', () => ({
  expect: jest.fn(() => ({
    toBeVisible: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('pressableClick detached-target retry', () => {
  it('rolls back the failed dispatch arm before preparing the retry', async () => {
    let armed = false;
    const armedDuringVisibility: boolean[] = [];
    const armedDuringPreparation: boolean[] = [];
    (playwrightExpect as unknown as jest.Mock).mockImplementation(() => ({
      toBeVisible: jest.fn().mockImplementation(async () => {
        armedDuringVisibility.push(armed);
      }),
    }));
    const splash = {
      waitFor: jest.fn().mockRejectedValue(new Error('splash absent')),
    };
    const target = {
      page: () => ({
        getByTestId: () => splash,
      }),
      scrollIntoViewIfNeeded: jest.fn().mockImplementation(async () => {
        armedDuringPreparation.push(armed);
      }),
      evaluate: jest
        .fn()
        .mockRejectedValueOnce(new Error('Element is not attached to the DOM'))
        .mockResolvedValueOnce(undefined),
    } as unknown as Locator;
    const rollback = jest.fn(() => {
      armed = false;
    });
    const beforeDispatch = jest.fn(() => {
      armed = true;
      return rollback;
    });

    await pressableClick(target, { beforeDispatch });

    expect(armedDuringVisibility).toEqual([false, false]);
    expect(armedDuringPreparation).toEqual([false, false]);
    expect(beforeDispatch).toHaveBeenCalledTimes(2);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(armed).toBe(true);
  });
});
