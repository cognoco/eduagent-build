import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  beginAttempt,
  enqueue,
  escalate,
  listEntries,
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
      'network'
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
      'timeout'
    );

    expect(failed?.status).toBe('permanently-failed');
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
