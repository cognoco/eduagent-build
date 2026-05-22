import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  beginAttempt,
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
