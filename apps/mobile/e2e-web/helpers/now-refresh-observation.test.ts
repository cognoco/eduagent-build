import {
  NOW_REFRESH_OBSERVATION_WINDOW_MS,
  PRODUCTION_MENTOR_RETURN_REFRESH_BOUND_MS,
  assertArmedBeforeAction,
  observeExactNowRefresh,
} from './now-refresh-observation';

describe('exact Now-feed refresh observation (WI-2833)', () => {
  it('keeps the observation window at least as long as the WI-2818 production bound', () => {
    // If the window were shorter than production's own bound, this
    // observation could report "unsettled" for a refresh production itself
    // would still have honored — the two bounds must stay compatible.
    expect(NOW_REFRESH_OBSERVATION_WINDOW_MS).toBeGreaterThan(
      PRODUCTION_MENTOR_RETURN_REFRESH_BOUND_MS,
    );
  });

  it('resolves settled when the exact response arrives inside the window (variant a: success)', async () => {
    const response = {
      url: () => 'https://api-stg.mentomate.com/v1/now?scope=self',
    };
    const outcome = await observeExactNowRefresh(Promise.resolve(response), {
      armedAtMs: 0,
      actionAtMs: 1,
    });
    expect(outcome).toEqual({ kind: 'settled', response });
  });

  it('resolves rejected without throwing when the response errors or aborts (variant b: rejection/abort)', async () => {
    const error = new Error('net::ERR_ABORTED');
    const outcome = await observeExactNowRefresh(Promise.reject(error), {
      armedAtMs: 0,
      actionAtMs: 1,
    });
    expect(outcome).toEqual({ kind: 'rejected', error });
  });

  it('bounds a non-settling response to the observation window instead of hanging (variant c: non-settlement)', async () => {
    jest.useFakeTimers();
    try {
      const neverSettles = new Promise<never>(() => undefined);
      const outcomePromise = observeExactNowRefresh(neverSettles, {
        armedAtMs: 0,
        actionAtMs: 1,
      });
      const expectation = expect(outcomePromise).resolves.toEqual({
        kind: 'unsettled',
      });
      await jest.advanceTimersByTimeAsync(NOW_REFRESH_OBSERVATION_WINDOW_MS);
      await expectation;
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('still bounds correctly when the action lands long after arming (variant d: expanded parallel worker load)', async () => {
    jest.useFakeTimers();
    try {
      const response = {
        url: () => 'https://api-stg.mentomate.com/v1/now?scope=self',
      };
      // Arming happened at t=0, but CPU contention across parallel workers
      // delayed the actual triggering action to t=10_000 — ordering (armed
      // before action) still holds, and the response settles comfortably
      // inside the observation window measured from when we start racing.
      const outcomePromise = observeExactNowRefresh(Promise.resolve(response), {
        armedAtMs: 0,
        actionAtMs: 10_000,
      });
      await jest.advanceTimersByTimeAsync(0);
      await expect(outcomePromise).resolves.toEqual({
        kind: 'settled',
        response,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('[WI-2833 regression] throws when armed at or after the triggering action instead of silently racing the production bound', () => {
    // This is the exact hold-then-late-wait ordering bug: the previous spec
    // armed its bounded wait only after post-Back assertions, i.e. AFTER the
    // action that starts the production bound. That ordering must be caught,
    // not silently tolerated.
    expect(() => assertArmedBeforeAction(1, 1)).toThrow(
      /\[now-refresh:ordering\]/,
    );
    expect(() => assertArmedBeforeAction(5, 1)).toThrow(
      /\[now-refresh:ordering\]/,
    );
  });

  it('[WI-2833 regression] observeExactNowRefresh itself refuses a late arm before racing anything', async () => {
    const response = {
      url: () => 'https://api-stg.mentomate.com/v1/now?scope=self',
    };
    await expect(
      observeExactNowRefresh(Promise.resolve(response), {
        armedAtMs: 5,
        actionAtMs: 1,
      }),
    ).rejects.toThrow(/\[now-refresh:ordering\]/);
  });
});
