// Tests for the WI-1602 adaptive heartbeat-write cadence decision module.
// Pure logic, no fixtures beyond plain objects/dates — run offline with `bun test`
// (same convention as lease.test.ts).

import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_CADENCE_CONFIG,
  isIdle,
  nextHeartbeatInterval,
  nextInterval,
  type CadenceState,
  type LivenessSignals,
} from './heartbeat-cadence';

const BASE = DEFAULT_CADENCE_CONFIG.baseMs;

function signals(overrides: Partial<LivenessSignals> = {}): LivenessSignals {
  return {
    hasInFlightWork: false,
    lastActivityAt: null,
    explicitBlockedOrPaused: false,
    ...overrides,
  };
}

describe('isIdle', () => {
  test('active lane (in-flight work) is never idle', () => {
    const now = new Date('2026-07-05T12:00:00Z');
    expect(isIdle(signals({ hasInFlightWork: true }), null, now)).toBe(false);
  });

  test('cold start: fresh traffic within the window is not idle', () => {
    const now = new Date('2026-07-05T12:00:00Z');
    const recent = new Date(now.getTime() - 1000).toISOString();
    expect(isIdle(signals({ lastActivityAt: recent }), null, now)).toBe(false);
  });

  test('cold start: stale traffic past the window is idle', () => {
    const now = new Date('2026-07-05T12:00:00Z');
    const stale = new Date(
      now.getTime() - DEFAULT_CADENCE_CONFIG.idleWindowMs - 1,
    ).toISOString();
    expect(isIdle(signals({ lastActivityAt: stale }), null, now)).toBe(true);
  });

  test('never-seen activity is idle', () => {
    const now = new Date('2026-07-05T12:00:00Z');
    expect(isIdle(signals(), null, now)).toBe(true);
  });

  test('unchanged lastActivityAt since the previous tick is idle, however long ago it was', () => {
    const now = new Date('2026-07-05T12:00:00Z');
    const ts = new Date(now.getTime() - 5 * BASE).toISOString();
    expect(isIdle(signals({ lastActivityAt: ts }), ts, now)).toBe(true);
  });

  test('lastActivityAt newer than the previous observation is NOT idle, even long after now (edge-triggered)', () => {
    // This is the mid-backoff-sleep case: `now` is far past `idleWindowMs` relative to
    // the new activity, which a window-vs-now check would misclassify as stale/idle.
    const previousObserved = new Date('2026-07-05T12:00:00Z').toISOString();
    const newActivity = new Date('2026-07-05T12:01:00Z').toISOString(); // 1 min after previous
    const now = new Date('2026-07-05T12:20:00Z'); // 19 min after the new activity — well past idleWindowMs
    expect(
      isIdle(signals({ lastActivityAt: newActivity }), previousObserved, now),
    ).toBe(false);
  });

  test('explicit blocked/paused marker is idle even with in-flight work and fresh traffic', () => {
    const now = new Date('2026-07-05T12:00:00Z');
    const veryRecent = now.toISOString();
    expect(
      isIdle(
        signals({
          hasInFlightWork: true,
          lastActivityAt: veryRecent,
          explicitBlockedOrPaused: true,
        }),
        null,
        now,
      ),
    ).toBe(true);
  });
});

describe('nextInterval — the backoff curve + snap-back', () => {
  test('idle escalates base -> 2x -> 4x, then caps at 4x', () => {
    let interval = BASE;
    interval = nextInterval(true, interval); // idle tick 1
    expect(interval).toBe(2 * BASE);
    interval = nextInterval(true, interval); // idle tick 2
    expect(interval).toBe(4 * BASE);
    interval = nextInterval(true, interval); // idle tick 3 — capped, does not exceed 4x
    expect(interval).toBe(4 * BASE);
    interval = nextInterval(true, interval); // idle tick 4 — still capped
    expect(interval).toBe(4 * BASE);
  });

  test('activity snaps back to base immediately from any backoff depth', () => {
    expect(nextInterval(false, 4 * BASE)).toBe(BASE);
    expect(nextInterval(false, 2 * BASE)).toBe(BASE);
    expect(nextInterval(false, BASE)).toBe(BASE);
  });

  test('curve respects a config-driven multiplier set and cap', () => {
    const config = { ...DEFAULT_CADENCE_CONFIG, backoffMultipliers: [1, 3] };
    let interval = config.baseMs;
    interval = nextInterval(true, interval, config);
    expect(interval).toBe(3 * config.baseMs);
    interval = nextInterval(true, interval, config); // capped at the configured 3x
    expect(interval).toBe(3 * config.baseMs);
  });
});

// The required red test: sequence over an idle lane follows the curve, and injected
// activity snaps the very next interval back to base — including activity that arrives
// mid-sleep, deep in the backoff, which a naive window-vs-now check would miss. Fails
// against a naive "always return baseMs" stand-in (backoff asserts) and against a naive
// "always escalate" stand-in (snap-back asserts); passes with the real decision logic.
describe('nextHeartbeatInterval — red test: idle backoff sequence + activity snap-back', () => {
  test('idle lane backs off along the curve; activity immediately resets to base', () => {
    const t0 = new Date('2026-07-05T12:00:00Z');
    const idleSignals = signals({
      hasInFlightWork: false,
      lastActivityAt: new Date(
        t0.getTime() - DEFAULT_CADENCE_CONFIG.idleWindowMs - 1,
      ).toISOString(),
    });

    let state: CadenceState | null = null;
    const observed: number[] = [];
    let tickTime = t0;

    // Four consecutive idle ticks — expect 2x -> 4x -> 4x -> 4x (capped).
    for (let i = 0; i < 4; i++) {
      state = nextHeartbeatInterval(idleSignals, state, tickTime);
      observed.push(state.intervalMs);
      tickTime = new Date(tickTime.getTime() + state.intervalMs);
    }
    expect(observed).toEqual([2 * BASE, 4 * BASE, 4 * BASE, 4 * BASE]);

    // Activity arrives mid-sleep while backed off to the 4x cap: a new Clacks line lands
    // shortly after the previous tick, but `tickTime` (the next scheduled check) is a full
    // 4x-interval later — well outside `idleWindowMs` relative to `now`. A window-vs-now
    // check would call this stale; the edge-triggered check must still catch it because it
    // is newer than what was observed last tick.
    const activityAt = new Date(tickTime.getTime() - state!.intervalMs + 5000); // shortly after the prior tick
    const activeSignals = signals({ lastActivityAt: activityAt.toISOString() });
    state = nextHeartbeatInterval(activeSignals, state, tickTime);
    expect(state.intervalMs).toBe(BASE);
  });
});
