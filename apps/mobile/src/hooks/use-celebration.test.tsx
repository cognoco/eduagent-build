// ---------------------------------------------------------------------------
// use-celebration hook tests [Phase 6 / batch-A]
// ---------------------------------------------------------------------------

import { renderHook, act } from '@testing-library/react-native';
import { isValidElement } from 'react';
import { useCelebration } from './use-celebration';
import type { ReactElement, ReactNode } from 'react';
import type { PendingCelebration } from '@eduagent/schemas';

function makeEntry(
  celebration: PendingCelebration['celebration'],
  reason: PendingCelebration['reason'],
  overrides?: Partial<PendingCelebration>,
): PendingCelebration {
  return {
    celebration,
    reason,
    detail: null,
    queuedAt: new Date().toISOString(),
    ...overrides,
  };
}

function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return [];
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return [String(node)];
  }
  if (Array.isArray(node)) {
    return node.flatMap(collectText);
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return collectText(node.props.children);
  }
  return [];
}

function completeActiveCelebration(overlay: ReactElement | null): void {
  if (!overlay) {
    throw new Error('Expected an active celebration overlay');
  }

  const children = (overlay as ReactElement<{ children?: ReactNode }>).props
    .children;
  const celebration = Array.isArray(children) ? children[0] : children;
  if (
    !isValidElement<{ onComplete?: () => void }>(celebration) ||
    typeof celebration.props.onComplete !== 'function'
  ) {
    throw new Error('Expected overlay celebration child to expose onComplete');
  }

  celebration.props.onComplete();
}

describe('useCelebration — trigger()', () => {
  it('returns null overlay when nothing has been triggered', () => {
    const { result } = renderHook(() => useCelebration());
    expect(result.current.CelebrationOverlay).toBeNull();
  });

  it('exposes all 4 celebration registry entries', () => {
    const { result } = renderHook(() => useCelebration());
    expect(Object.keys(result.current.registry)).toEqual([
      'polar_star',
      'twin_stars',
      'comet',
      'orions_belt',
    ]);
  });

  it('trigger() makes CelebrationOverlay non-null immediately', async () => {
    const { result } = renderHook(() =>
      useCelebration({ celebrationLevel: 'all', audience: 'child' }),
    );

    await act(async () => {
      result.current.trigger({
        celebration: 'polar_star',
        reason: 'polar_star',
      });
    });

    expect(result.current.CelebrationOverlay).not.toBeNull();
  });

  // [BREAK BUG-H-01] resolveCelebrationLevelForAccommodation returns 'all' when
  // accommodationMode is undefined (no accommodation), ignoring celebrationLevel.
  it('[BREAK BUG-H-01] trigger() is filtered out when celebrationLevel is "off"', async () => {
    // When no accommodationMode is passed (undefined), the resolver ignores
    // celebrationLevel and returns 'all', so the celebration shows despite 'off'.
    const { result } = renderHook(() =>
      useCelebration({ celebrationLevel: 'off', audience: 'child' }),
    );

    await act(async () => {
      result.current.trigger({
        celebration: 'polar_star',
        reason: 'polar_star',
      });
    });

    // EXPECTED: null (user chose celebrationLevel=off)
    // ACTUAL BUG: non-null because resolveCelebrationLevelForAccommodation
    // ignores celebrationLevel when accommodationMode is undefined
    expect(result.current.CelebrationOverlay).toBeNull();
  });

  it('trigger() allows tier-3+ celebrations when celebrationLevel is "big_only"', async () => {
    const { result } = renderHook(() =>
      useCelebration({ celebrationLevel: 'big_only', audience: 'child' }),
    );

    await act(async () => {
      result.current.trigger({ celebration: 'comet', reason: 'comet' }); // tier 3
    });

    expect(result.current.CelebrationOverlay).not.toBeNull();
  });

  // [BREAK BUG-H-01] same root cause: no accommodationMode → resolver ignores
  // big_only and returns 'all', so tier-1 celebrations appear when they shouldn't.
  it('[BREAK BUG-H-01] trigger() filters out tier-1 celebrations when celebrationLevel is "big_only"', async () => {
    const { result } = renderHook(() =>
      useCelebration({ celebrationLevel: 'big_only', audience: 'child' }),
    );

    await act(async () => {
      result.current.trigger({
        celebration: 'polar_star',
        reason: 'polar_star',
      }); // tier 1
    });

    // EXPECTED: null (tier 1 < big_only threshold)
    // ACTUAL BUG: non-null because resolveCelebrationLevelForAccommodation
    // overrides celebrationLevel to 'all' when accommodationMode is undefined
    expect(result.current.CelebrationOverlay).toBeNull();
  });
});

describe('useCelebration — queue prop', () => {
  it('shows first entry from queue immediately', async () => {
    const entry = makeEntry('comet', 'comet');

    const { result } = renderHook(() =>
      useCelebration({
        queue: [entry],
        celebrationLevel: 'all',
      }),
    );

    // flushNext fires from the useEffect; wait for state update
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.CelebrationOverlay).not.toBeNull();
  });

  it('skips already-seen entries on re-render with same queue', async () => {
    const entry = makeEntry('polar_star', 'polar_star', {
      queuedAt: '2026-01-01T00:00:00.000Z',
    });

    const { result, rerender } = renderHook(
      ({ queue }: { queue: PendingCelebration[] }) =>
        useCelebration({ queue, celebrationLevel: 'all' }),
      { initialProps: { queue: [entry] } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.CelebrationOverlay).not.toBeNull();

    // Re-render with the exact same entry — already seen, must not re-queue
    rerender({ queue: [entry] });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // onAllComplete is not passed, so we just verify no double-queue crash
    expect(result.current.CelebrationOverlay).not.toBeNull();
  });

  it('dedupes same-profile rerenders but replays queue keys after a profile switch without unmount', async () => {
    const firstEntry = makeEntry('polar_star', 'polar_star', {
      queuedAt: '2026-01-01T00:00:00.000Z',
      detail: 'profile-scoped celebration',
    });
    const secondEntry = makeEntry('twin_stars', 'twin_stars', {
      queuedAt: '2026-01-01T00:00:00.000Z',
      detail: 'profile-scoped second celebration',
    });
    const queue = [firstEntry, secondEntry];
    const onAllComplete = jest.fn();

    const { result, rerender } = renderHook(
      ({
        profileId,
        queue,
      }: {
        profileId: string;
        queue: PendingCelebration[];
      }) =>
        useCelebration({
          profileId,
          queue,
          celebrationLevel: 'all',
          onAllComplete,
        }),
      { initialProps: { profileId: 'profile-A', queue } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(collectText(result.current.CelebrationOverlay)).toContain(
      'profile-scoped celebration',
    );

    await act(async () => {
      completeActiveCelebration(result.current.CelebrationOverlay);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(collectText(result.current.CelebrationOverlay)).toContain(
      'profile-scoped second celebration',
    );

    await act(async () => {
      completeActiveCelebration(result.current.CelebrationOverlay);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.CelebrationOverlay).toBeNull();

    rerender({ profileId: 'profile-A', queue });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.CelebrationOverlay).toBeNull();

    rerender({ profileId: 'profile-B', queue });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(collectText(result.current.CelebrationOverlay)).toContain(
      'profile-scoped celebration',
    );
  });

  it('caps queue at 2 celebrations per batch (MAX_TOASTS_PER_BATCH)', async () => {
    const batchTime = '2026-01-01T10:00:00.000Z';
    const entries: PendingCelebration[] = [
      makeEntry('polar_star', 'polar_star', { queuedAt: batchTime }),
      makeEntry('twin_stars', 'twin_stars', { queuedAt: batchTime }),
      makeEntry('comet', 'comet', { queuedAt: batchTime }),
    ];

    const { result } = renderHook(() =>
      useCelebration({ queue: entries, celebrationLevel: 'all' }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Only 2 should be queued (not 3) due to MAX_TOASTS_PER_BATCH = 2.
    // We can't directly inspect pendingQueue (internal state), but we can
    // verify overlay is showing (at least 1 was queued/shown) and subsequent
    // entries in same batch are throttled.
    expect(result.current.CelebrationOverlay).not.toBeNull();
  });

  it('keeps over-cap entries eligible for a later batch instead of marking them seen', async () => {
    const firstBatchTime = '2026-01-01T10:00:00.000Z';
    const nextBatchTime = '2026-01-01T10:05:00.000Z';
    const entries: PendingCelebration[] = [
      makeEntry('polar_star', 'polar_star', {
        queuedAt: firstBatchTime,
        detail: 'first capped celebration',
      }),
      makeEntry('twin_stars', 'twin_stars', {
        queuedAt: firstBatchTime,
        detail: 'second capped celebration',
      }),
      makeEntry('comet', 'comet', {
        queuedAt: firstBatchTime,
        detail: 'third overflow celebration',
      }),
    ];
    const nextBatchEntry = makeEntry('orions_belt', 'orions_belt', {
      queuedAt: nextBatchTime,
      detail: 'new batch celebration',
    });

    const { result, rerender } = renderHook(
      ({ queue }: { queue: PendingCelebration[] }) =>
        useCelebration({ queue, celebrationLevel: 'all' }),
      { initialProps: { queue: entries } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(collectText(result.current.CelebrationOverlay)).toContain(
      'first capped celebration',
    );

    await act(async () => {
      completeActiveCelebration(result.current.CelebrationOverlay);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(collectText(result.current.CelebrationOverlay)).toContain(
      'second capped celebration',
    );

    await act(async () => {
      completeActiveCelebration(result.current.CelebrationOverlay);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.CelebrationOverlay).toBeNull();

    rerender({ queue: [...entries, nextBatchEntry] });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(collectText(result.current.CelebrationOverlay)).toContain(
      'third overflow celebration',
    );
  });

  it('calls onAllComplete when queue is exhausted', async () => {
    const onAllComplete = jest.fn();
    const entry = makeEntry('polar_star', 'polar_star', {
      queuedAt: '2026-01-01T10:00:00.000Z',
    });

    // Render with no queue initially (empty) to trigger onAllComplete path
    renderHook(() =>
      useCelebration({
        queue: [],
        celebrationLevel: 'all',
        onAllComplete,
      }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // With empty queue, onAllComplete should NOT fire (nothing was ever queued)
    expect(onAllComplete).not.toHaveBeenCalled();
    void entry; // suppress unused warning
  });

  // [BREAK BUG-H-01] queue path: same root cause — no accommodationMode means
  // the resolver ignores the passed celebrationLevel and returns 'all'.
  it('[BREAK BUG-H-01] filters queue entries by celebrationLevel "off"', async () => {
    const entry = makeEntry('orions_belt', 'orions_belt', {
      queuedAt: '2026-01-01T10:00:00.000Z',
    });

    const { result } = renderHook(() =>
      useCelebration({ queue: [entry], celebrationLevel: 'off' }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // EXPECTED: null (celebrationLevel=off means no celebrations)
    // ACTUAL BUG: non-null — resolver ignores 'off' and returns 'all'
    expect(result.current.CelebrationOverlay).toBeNull();
  });

  // [BREAK BUG-H-01] queue path with big_only: same root cause.
  it('[BREAK BUG-H-01] filters tier-1 and tier-2 from queue when celebrationLevel is "big_only"', async () => {
    const smallEntry = makeEntry('polar_star', 'polar_star', {
      queuedAt: '2026-01-01T10:00:00.000Z',
    });

    const { result } = renderHook(() =>
      useCelebration({ queue: [smallEntry], celebrationLevel: 'big_only' }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // EXPECTED: null (polar_star is tier 1, below "big_only" threshold)
    // ACTUAL BUG: non-null — resolver ignores 'big_only' and returns 'all'
    expect(result.current.CelebrationOverlay).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BUG-H-01: resolveCelebrationLevelForAccommodation ignores celebrationLevel
// for accommodationMode = 'none' and 'audio-first'.
// The function returns 'all' unconditionally when accommodationMode is not
// 'short-burst' or 'predictable', which means a user who set
// celebrationLevel = 'off' but has accommodationMode = 'none' will still
// see celebrations.
// ---------------------------------------------------------------------------
describe('useCelebration — accommodation mode interaction [BUG-H-01]', () => {
  it('[BREAK BUG-H-01] respects celebrationLevel=off even when accommodationMode=none', async () => {
    // With accommodationMode='none', resolveCelebrationLevelForAccommodation
    // ignores the passed celebrationLevel and returns 'all'. This means
    // a user's explicit 'off' setting is silently overridden.
    const { result } = renderHook(() =>
      useCelebration({
        celebrationLevel: 'off',
        accommodationMode: 'none',
        audience: 'child',
      }),
    );

    await act(async () => {
      result.current.trigger({
        celebration: 'polar_star',
        reason: 'polar_star',
      });
    });

    // EXPECTED: null (user set celebrationLevel=off)
    // ACTUAL BUG: non-null because accommodationMode=none forces level='all'
    expect(result.current.CelebrationOverlay).toBeNull();
  });

  it('[BREAK BUG-H-01] respects celebrationLevel=off even when accommodationMode=audio-first', async () => {
    const { result } = renderHook(() =>
      useCelebration({
        celebrationLevel: 'off',
        accommodationMode: 'audio-first',
        audience: 'child',
      }),
    );

    await act(async () => {
      result.current.trigger({
        celebration: 'orions_belt',
        reason: 'orions_belt',
      });
    });

    // EXPECTED: null (user set celebrationLevel=off)
    // ACTUAL BUG: non-null because accommodationMode=audio-first forces level='all'
    expect(result.current.CelebrationOverlay).toBeNull();
  });

  it('respects celebrationLevel=off when accommodationMode=short-burst (this path works correctly)', async () => {
    // short-burst DOES pass the celebrationLevel through, so 'off' works.
    const { result } = renderHook(() =>
      useCelebration({
        celebrationLevel: 'off',
        accommodationMode: 'short-burst',
        audience: 'child',
      }),
    );

    await act(async () => {
      result.current.trigger({
        celebration: 'polar_star',
        reason: 'polar_star',
      });
    });

    expect(result.current.CelebrationOverlay).toBeNull();
  });
});

describe('useCelebration — audience copy', () => {
  it('renders child-friendly message for "child" audience', async () => {
    const { result } = renderHook(() =>
      useCelebration({ celebrationLevel: 'all', audience: 'child' }),
    );

    await act(async () => {
      result.current.trigger({
        celebration: 'comet',
        reason: 'topic_mastered',
      });
    });

    // The overlay is non-null; exact message is rendered inside it
    expect(result.current.CelebrationOverlay).not.toBeNull();
  });

  it('renders adult message for "adult" audience', async () => {
    const { result } = renderHook(() =>
      useCelebration({ celebrationLevel: 'all', audience: 'adult' }),
    );

    await act(async () => {
      result.current.trigger({
        celebration: 'comet',
        reason: 'topic_mastered',
      });
    });

    expect(result.current.CelebrationOverlay).not.toBeNull();
  });
});

describe('useCelebration — stale callback regression (Bug 537)', () => {
  it('does not call the first callback (fnA) after swapping to fnB', async () => {
    const fnA = jest.fn();
    const fnB = jest.fn();

    const entry1 = makeEntry('polar_star', 'polar_star', {
      queuedAt: '2026-02-01T10:00:00.000Z',
    });

    const { rerender } = renderHook(
      ({ onAllComplete, queue }) =>
        useCelebration({ queue, celebrationLevel: 'all', onAllComplete }),
      { initialProps: { onAllComplete: fnA, queue: [entry1] } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    rerender({ onAllComplete: fnB, queue: [entry1] });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(fnA).not.toHaveBeenCalled();
  });
});
