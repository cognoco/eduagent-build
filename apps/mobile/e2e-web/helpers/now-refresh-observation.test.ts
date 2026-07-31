import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOW_REFRESH_OBSERVATION_WINDOW_MS,
  PRODUCTION_MENTOR_RETURN_REFRESH_BOUND_MS,
  assertArmedBeforeAction,
  assertRequestAttempted,
  captureNowRefreshPayload,
  observeExactNowRefresh,
  observeNowRefreshRequestAttempt,
} from './now-refresh-observation';

describe('exact Now-feed payload lifetime (WI-2961)', () => {
  it('captures the successful payload as soon as the exact response settles', async () => {
    const payload = {
      scope: 'self',
      generatedAt: '2026-07-31T12:00:00.000Z',
    };
    const response = { json: jest.fn().mockResolvedValue(payload) };

    await expect(
      captureNowRefreshPayload(Promise.resolve(response), (settledResponse) =>
        settledResponse.json(),
      ),
    ).resolves.toEqual({ response, payload });
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it('preserves rejection/abort classification when the response never arrives', async () => {
    const error = new Error('net::ERR_ABORTED');
    const readPayload = jest.fn<Promise<unknown>, [unknown]>();

    const outcome = await observeExactNowRefresh(
      captureNowRefreshPayload(Promise.reject(error), readPayload),
      { armedAtMs: 0, actionAtMs: 1 },
    );

    expect(outcome).toEqual({ kind: 'rejected', error });
    expect(readPayload).not.toHaveBeenCalled();
  });

  it('keeps a non-settling response bounded instead of hanging while capture is armed', async () => {
    jest.useFakeTimers();
    try {
      const neverSettles = new Promise<never>(() => undefined);
      const outcomePromise = observeExactNowRefresh(
        captureNowRefreshPayload(neverSettles, async () => undefined),
        { armedAtMs: 0, actionAtMs: 1 },
      );
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

  it('retains the captured payload after navigation releases the Playwright response body', async () => {
    const payload = {
      scope: 'self',
      generatedAt: '2026-07-31T12:00:01.000Z',
    };
    let bodyReleased = false;
    const response = {};
    const readPayload = jest.fn(async (settledResponse: typeof response) => {
      expect(settledResponse).toBe(response);
      if (bodyReleased) {
        throw new Error(
          'Protocol error (Network.getResponseBody): No data found for resource with given identifier',
        );
      }
      return payload;
    });

    const capturedPromise = captureNowRefreshPayload(
      Promise.resolve(response),
      readPayload,
    );
    await Promise.resolve();
    expect(readPayload).toHaveBeenCalledTimes(1);

    bodyReleased = true;
    await expect(readPayload(response)).rejects.toThrow(
      /No data found for resource/,
    );
    await expect(capturedPromise).resolves.toEqual({ response, payload });
  });

  it('arms payload capture before Back and never reads the retained response afterward', () => {
    const flowSource = readFileSync(
      join(__dirname, '..', 'flows', 'v2', 'returning-learner-resume.spec.ts'),
      'utf8',
    );
    const captureIndex = flowSource.indexOf(
      'const postBackNowCapturePromise = captureNowRefreshPayload(',
    );
    const backIndex = flowSource.indexOf(
      "pressableClick(page.getByTestId('chat-shell-back'))",
    );

    expect(captureIndex).toBeGreaterThanOrEqual(0);
    expect(backIndex).toBeGreaterThan(captureIndex);
    expect(flowSource).not.toContain('postBackNowResponse.json()');
  });
});

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

describe('exact Now-feed refresh REQUEST-attempt observation (WI-2833 rework)', () => {
  // [WI-2833 rework] The prior spec only ever observed the RESPONSE
  // (page.waitForResponse). If production regresses and never sends the
  // post-Back request at all, that promise simply times out the same way a
  // legitimate abort/non-settlement does -- observeExactNowRefresh reports
  // both as accepted outcomes ('rejected' / 'unsettled'). This suite covers
  // an INDEPENDENT observation of the request itself, so "no request fired"
  // is always a distinct, always-checked failure -- never silently folded
  // into a response classification.

  it('resolves attempted when a matching request is observed inside the window (variant a: request fires)', async () => {
    const request = {
      url: () => 'https://api-stg.mentomate.com/v1/now?scope=self',
    };
    const outcome = await observeNowRefreshRequestAttempt(
      Promise.resolve(request),
      { armedAtMs: 0, actionAtMs: 1 },
    );
    expect(outcome).toEqual({ kind: 'attempted', request });
  });

  it('resolves not-attempted when no matching request is observed within the window (variant b: production regression -- no request fired)', async () => {
    jest.useFakeTimers();
    try {
      const neverFires = new Promise<never>(() => undefined);
      const outcomePromise = observeNowRefreshRequestAttempt(neverFires, {
        armedAtMs: 0,
        actionAtMs: 1,
      });
      const expectation = expect(outcomePromise).resolves.toEqual({
        kind: 'not-attempted',
      });
      await jest.advanceTimersByTimeAsync(NOW_REFRESH_OBSERVATION_WINDOW_MS);
      await expectation;
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves not-attempted (never throws) when the underlying request promise itself rejects, e.g. Playwright waitForRequest timing out (variant c: request-promise rejection)', async () => {
    const outcome = await observeNowRefreshRequestAttempt(
      Promise.reject(new Error('Timeout waiting for request')),
      { armedAtMs: 0, actionAtMs: 1 },
    );
    expect(outcome).toEqual({ kind: 'not-attempted' });
  });

  it('still bounds correctly when the action lands long after arming (variant d: expanded parallel worker load)', async () => {
    jest.useFakeTimers();
    try {
      const request = {
        url: () => 'https://api-stg.mentomate.com/v1/now?scope=self',
      };
      const outcomePromise = observeNowRefreshRequestAttempt(
        Promise.resolve(request),
        { armedAtMs: 0, actionAtMs: 10_000 },
      );
      await jest.advanceTimersByTimeAsync(0);
      await expect(outcomePromise).resolves.toEqual({
        kind: 'attempted',
        request,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('[WI-2833 regression] refuses a late arm before racing anything, same ordering guard as observeExactNowRefresh', async () => {
    const request = {
      url: () => 'https://api-stg.mentomate.com/v1/now?scope=self',
    };
    await expect(
      observeNowRefreshRequestAttempt(Promise.resolve(request), {
        armedAtMs: 5,
        actionAtMs: 1,
      }),
    ).rejects.toThrow(/\[now-refresh:ordering\]/);
  });

  it('[WI-2833 rework] assertRequestAttempted throws a distinct, actionable error for a not-attempted outcome', () => {
    expect(() => assertRequestAttempted({ kind: 'not-attempted' })).toThrow(
      /\[now-refresh:not-attempted\]/,
    );
  });

  it('[WI-2833 rework] assertRequestAttempted does not throw for an attempted outcome', () => {
    const request = {
      url: () => 'https://api-stg.mentomate.com/v1/now?scope=self',
    };
    expect(() =>
      assertRequestAttempted({ kind: 'attempted', request }),
    ).not.toThrow();
  });
});
