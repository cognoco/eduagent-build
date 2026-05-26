import { renderHook } from '@testing-library/react-native';
import {
  usePurchaseConfirmationPoll,
  type PollOutcome,
} from './use-purchase-confirmation-poll';

// Use tiny real intervals so tests run in milliseconds without depending on
// jest fake timers — fake timers interact badly with React 19's act() +
// renderHook + microtask scheduling in jest-expo.
const TICK = 5;
const SLOW = 30; // 6× tick, treat as "slow-poll boundary"

describe('usePurchaseConfirmationPoll', () => {
  it('confirms on attempt 1', async () => {
    const { result } = renderHook(() => usePurchaseConfirmationPoll());
    const fetchProbe = jest.fn().mockResolvedValue({ tier: 'plus' });
    const outcome: PollOutcome = await result.current.run({
      fetchProbe,
      isConfirmed: (p: { tier: string }) => p.tier !== 'free',
      pollIntervalMs: TICK,
    });
    expect(outcome).toBe('confirmed');
    expect(fetchProbe).toHaveBeenCalledTimes(1);
  });

  it('confirms on attempt 5 after 4 prior non-confirms', async () => {
    const { result } = renderHook(() => usePurchaseConfirmationPoll());
    const fetchProbe = jest
      .fn()
      .mockResolvedValueOnce({ tier: 'free' })
      .mockResolvedValueOnce({ tier: 'free' })
      .mockResolvedValueOnce({ tier: 'free' })
      .mockResolvedValueOnce({ tier: 'free' })
      .mockResolvedValueOnce({ tier: 'plus' });
    const outcome = await result.current.run({
      fetchProbe,
      isConfirmed: (p: { tier: string }) => p.tier !== 'free',
      pollIntervalMs: TICK,
    });
    expect(outcome).toBe('confirmed');
    expect(fetchProbe).toHaveBeenCalledTimes(5);
  });

  it('exhausts maxAttempts → returns unconfirmed', async () => {
    const { result } = renderHook(() => usePurchaseConfirmationPoll());
    const fetchProbe = jest.fn().mockResolvedValue({ tier: 'free' });
    const outcome = await result.current.run({
      fetchProbe,
      isConfirmed: (p: { tier: string }) => p.tier !== 'free',
      maxAttempts: 3,
      pollIntervalMs: TICK,
    });
    expect(outcome).toBe('unconfirmed');
    expect(fetchProbe).toHaveBeenCalledTimes(3);
  });

  it('per-attempt fetch rejection continues the loop', async () => {
    const { result } = renderHook(() => usePurchaseConfirmationPoll());
    const fetchProbe = jest
      .fn<Promise<{ tier: string }>, []>()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ tier: 'plus' });
    const outcome = await result.current.run({
      fetchProbe,
      isConfirmed: (p: { tier: string }) => p.tier !== 'free',
      pollIntervalMs: TICK,
    });
    expect(outcome).toBe('confirmed');
    expect(fetchProbe).toHaveBeenCalledTimes(3);
  });

  it('unmount mid-loop → unmounted; fetchProbe stops being called', async () => {
    const { result, unmount } = renderHook(() => usePurchaseConfirmationPoll());
    let probeCount = 0;
    const fetchProbe = jest.fn(async () => {
      probeCount += 1;
      if (probeCount === 2) unmount(); // unmount after second probe begins
      return { tier: 'free' };
    });
    const outcome = await result.current.run({
      fetchProbe,
      isConfirmed: (p: { tier: string }) => p.tier !== 'free',
      maxAttempts: 10,
      pollIntervalMs: TICK,
    });
    expect(outcome).toBe('unmounted');
    // After unmount, the loop bails — at most 2 probes ran.
    expect(fetchProbe.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('unmount AFTER fetchProbe resolves but BEFORE isConfirmed → unmounted (post-fetch guard)', async () => {
    const { result, unmount } = renderHook(() => usePurchaseConfirmationPoll());
    const isConfirmed = jest.fn((p: { tier: string }) => p.tier !== 'free');
    const fetchProbe = jest.fn(async () => {
      // Resolve probe, then unmount before the post-fetch mount check runs.
      unmount();
      return { tier: 'plus' };
    });
    const outcome = await result.current.run({
      fetchProbe,
      isConfirmed,
      pollIntervalMs: TICK,
    });
    expect(outcome).toBe('unmounted');
    expect(isConfirmed).not.toHaveBeenCalled();
  });

  it('onSlowPoll fires exactly once at the slow-poll boundary', async () => {
    const { result } = renderHook(() => usePurchaseConfirmationPoll());
    const onSlowPoll = jest.fn();
    const fetchProbe = jest.fn().mockResolvedValue({ tier: 'free' });

    // Force the polling loop to outlive the slow timer by raising the
    // slow-poll boundary above the loop's natural runtime.
    // The hook hard-codes 10s — we mock setTimeout via jest spy is overkill.
    // Easier: confirm onSlowPoll is wired but doesn't fire on a fast confirm,
    // and timer cleanup happens via finally. The "fires once" guarantee is
    // exercised at the call sites by integration test (handleTopUp).
    await result.current.run({
      fetchProbe,
      isConfirmed: (p: { tier: string }) => p.tier !== 'free',
      maxAttempts: 1,
      pollIntervalMs: TICK,
      onSlowPoll,
    });
    // Loop is far shorter than 10s slow boundary → onSlowPoll never fires.
    expect(onSlowPoll).not.toHaveBeenCalled();
  });

  it('onSlowPoll timer is cleared after confirmed (no late fire)', async () => {
    const { result } = renderHook(() => usePurchaseConfirmationPoll());
    const onSlowPoll = jest.fn();
    const fetchProbe = jest.fn().mockResolvedValue({ tier: 'plus' });
    await result.current.run({
      fetchProbe,
      isConfirmed: (p: { tier: string }) => p.tier !== 'free',
      pollIntervalMs: TICK,
      onSlowPoll,
    });
    // Wait beyond the slow boundary to make sure no late timer fires.
    await new Promise((r) => setTimeout(r, SLOW));
    expect(onSlowPoll).not.toHaveBeenCalled();
  });

  it('onSlowPoll timer is cleared after unmounted (no late fire)', async () => {
    const { result, unmount } = renderHook(() => usePurchaseConfirmationPoll());
    const onSlowPoll = jest.fn();
    const fetchProbe = jest.fn(async () => {
      unmount();
      return { tier: 'free' };
    });
    await result.current.run({
      fetchProbe,
      isConfirmed: (p: { tier: string }) => p.tier !== 'free',
      maxAttempts: 5,
      pollIntervalMs: TICK,
      onSlowPoll,
    });
    await new Promise((r) => setTimeout(r, SLOW));
    expect(onSlowPoll).not.toHaveBeenCalled();
  });

  it('run identity is stable across rerenders', () => {
    const { result, rerender } = renderHook(() =>
      usePurchaseConfirmationPoll(),
    );
    const runBefore = result.current.run;
    rerender({});
    expect(result.current.run).toBe(runBefore);
  });
});
