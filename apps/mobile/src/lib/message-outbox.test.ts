import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  _isDrainInFlight,
  beginAttempt,
  drain,
  enqueue,
  escalate,
  listEntries,
  listPending,
  markConfirmed,
  recordFailure,
} from './message-outbox';

describe('message-outbox', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('enqueues, attempts, fails, and confirms entries', async () => {
    const entry = await enqueue({
      profileId: 'profile-1',
      flow: 'session',
      surfaceKey: 'session-1',
      content: 'hello',
      id: 'entry-1',
    });

    expect(entry.id).toBe('entry-1');

    const attempted = await beginAttempt('profile-1', 'session', 'entry-1');
    expect(attempted?.attempts).toBe(1);

    const failed = await recordFailure(
      'profile-1',
      'session',
      'entry-1',
      'network',
    );
    expect(failed?.failureReason).toBe('network');

    await markConfirmed('profile-1', 'session', 'entry-1');
    expect(await listEntries('profile-1', 'session')).toEqual([]);
  });

  it('marks entries permanently failed after three attempts', async () => {
    await enqueue({
      profileId: 'profile-1',
      flow: 'session',
      surfaceKey: 'session-2',
      content: 'hello',
      id: 'entry-2',
    });
    await beginAttempt('profile-1', 'session', 'entry-2');
    await beginAttempt('profile-1', 'session', 'entry-2');
    await beginAttempt('profile-1', 'session', 'entry-2');

    const failed = await recordFailure(
      'profile-1',
      'session',
      'entry-2',
      'timeout',
    );

    expect(failed?.status).toBe('permanently-failed');
  });

  // [BUG-556] Fence-post bug: validation guard calls recordFailure BEFORE
  // beginAttempt, so attempts is 0 and the >= MAX_OUTBOX_ATTEMPTS check never
  // triggers. Entry stays pending forever, retried on every drain.
  // Fix: permanent validation reasons must set status immediately regardless
  // of attempt count.
  it('[BUG-556] marks entry permanently-failed immediately for missing_session_id without prior beginAttempt', async () => {
    await enqueue({
      profileId: 'profile-1',
      flow: 'session',
      surfaceKey: 'session-bug556',
      content: 'hello',
      id: 'entry-bug556',
    });

    // Simulate validation failure BEFORE beginAttempt (attempts is still 0)
    const result = await recordFailure(
      'profile-1',
      'session',
      'entry-bug556',
      'missing_session_id',
    );

    expect(result?.status).toBe('permanently-failed');
    expect(result?.failureReason).toBe('missing_session_id');
    // Must NOT remain pending — drain must not retry it
    const pending = await listPending('profile-1', 'session');
    expect(pending).toHaveLength(0);
  });

  it('[BUG-556] retains pending status for transient failure when below MAX_OUTBOX_ATTEMPTS', async () => {
    await enqueue({
      profileId: 'profile-1',
      flow: 'session',
      surfaceKey: 'session-transient',
      content: 'hello',
      id: 'entry-transient',
    });
    await beginAttempt('profile-1', 'session', 'entry-transient');

    const result = await recordFailure(
      'profile-1',
      'session',
      'entry-transient',
      'network',
    );

    // 1 attempt, max is 3 — should remain pending (retryable)
    expect(result?.status).toBe('pending');
    expect(result?.failureReason).toBe('network');
  });

  // -------------------------------------------------------------------------
  // [BUG-635] drain() singleton — two concurrent drain() calls for the same
  // (profileId, flow) must NOT both invoke the handler for the same pending
  // entries. The first drain processes them; the second short-circuits with
  // 0. Without the singleton guard the second drain races the first, reads
  // the same pending list (handler may not have called markConfirmed yet),
  // and double-processes every entry.
  // -------------------------------------------------------------------------

  it('[BUG-635 / break-test] two concurrent drain() calls handle each entry exactly once', async () => {
    await enqueue({
      profileId: 'profile-race',
      flow: 'session',
      surfaceKey: 'session-race',
      content: 'a',
      id: 'race-1',
    });
    await enqueue({
      profileId: 'profile-race',
      flow: 'session',
      surfaceKey: 'session-race',
      content: 'b',
      id: 'race-2',
    });

    // Slow, observable handler so two concurrent drains can race on the same
    // pending list before any markConfirmed lands. Each invocation logs the
    // entry id; if the singleton guard is missing both drains see both
    // entries → 4 invocations total, with duplicates.
    const handled: string[] = [];
    let resolveSlow!: () => void;
    const slow = new Promise<void>((r) => {
      resolveSlow = r;
    });

    const handler = jest.fn(async (entry: { id: string }) => {
      handled.push(entry.id);
      await slow;
    });

    // Kick off the first drain. Its initial listPending awaits the storage
    // lock; the handler then awaits `slow`. Without the singleton, the
    // second drain we start below would race in and read the same pending
    // list.
    const first = drain('profile-race', 'session', handler);

    // Yield a few microtasks so the first drain reaches the handler-await
    // for the first entry. The lock is released by then; storage reads
    // from the second drain are unblocked.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const second = drain('profile-race', 'session', handler);

    // Now let the first drain's handlers complete.
    resolveSlow();
    const [firstCount, secondCount] = await Promise.all([first, second]);

    // First drain processed both entries; second drain short-circuited.
    expect(firstCount).toBe(2);
    expect(secondCount).toBe(0);
    // Handler called exactly twice — once per entry, no duplicates.
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handled.sort()).toEqual(['race-1', 'race-2']);
    // The in-flight flag is cleared so a follow-up drain works.
    expect(_isDrainInFlight('outbox-profile-race-session')).toBe(false);
  });

  it('[BUG-635] sequential drain() calls both run normally (singleton clears between)', async () => {
    await enqueue({
      profileId: 'profile-seq',
      flow: 'session',
      surfaceKey: 'session-seq',
      content: 'a',
      id: 'seq-1',
    });

    const handler = jest.fn().mockResolvedValue(undefined);

    const firstCount = await drain('profile-seq', 'session', handler);
    expect(firstCount).toBe(1);
    expect(_isDrainInFlight('outbox-profile-seq-session')).toBe(false);

    // Enqueue another entry; a fresh drain after the first finished must
    // process it (the singleton must not stay stuck).
    await enqueue({
      profileId: 'profile-seq',
      flow: 'session',
      surfaceKey: 'session-seq',
      content: 'b',
      id: 'seq-2',
    });

    const secondCount = await drain('profile-seq', 'session', handler);
    expect(secondCount).toBe(2); // seq-1 (still pending — handler is a noop) + seq-2
  });

  it('[BUG-635] drain() releases the singleton even when the handler throws', async () => {
    await enqueue({
      profileId: 'profile-throw',
      flow: 'session',
      surfaceKey: 'session-throw',
      content: 'a',
      id: 'throw-1',
    });

    const handler = jest.fn().mockRejectedValue(new Error('handler boom'));

    await drain('profile-throw', 'session', handler);

    // Singleton must be cleared; otherwise every future drain for this key
    // would short-circuit forever.
    expect(_isDrainInFlight('outbox-profile-throw-session')).toBe(false);
  });

  it('[BUG-635] drain() is per-key — concurrent drains for different profiles do not block each other', async () => {
    await enqueue({
      profileId: 'profile-A',
      flow: 'session',
      surfaceKey: 'session-A',
      content: 'a',
      id: 'a-1',
    });
    await enqueue({
      profileId: 'profile-B',
      flow: 'session',
      surfaceKey: 'session-B',
      content: 'b',
      id: 'b-1',
    });

    const handler = jest.fn().mockResolvedValue(undefined);

    const [aCount, bCount] = await Promise.all([
      drain('profile-A', 'session', handler),
      drain('profile-B', 'session', handler),
    ]);

    expect(aCount).toBe(1);
    expect(bCount).toBe(1);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('escalates permanently failed entries and deletes them on success', async () => {
    await enqueue({
      profileId: 'profile-1',
      flow: 'session',
      surfaceKey: 'session-1',
      content: 'hello',
      id: 'entry-3',
    });
    await beginAttempt('profile-1', 'session', 'entry-3');
    await beginAttempt('profile-1', 'session', 'entry-3');
    await beginAttempt('profile-1', 'session', 'entry-3');
    await recordFailure('profile-1', 'session', 'entry-3', 'timeout');

    const postToSupport = jest.fn().mockResolvedValue(undefined);
    const result = await escalate('profile-1', 'session', postToSupport);

    expect(result.escalated).toBe(1);
    expect(postToSupport).toHaveBeenCalledWith({
      entries: [
        expect.objectContaining({
          id: 'entry-3',
          flow: 'session',
          surfaceKey: 'session-1',
          content: 'hello',
        }),
      ],
    });
    expect(await listEntries('profile-1', 'session')).toEqual([]);
  });
});
