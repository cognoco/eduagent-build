import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import {
  useApiClient,
  getProxyMode,
  withIdempotencyKey,
} from '../lib/api-client';
import { getApiUrl } from '../lib/api';
import { useProfile } from '../lib/profile';
import {
  beginAttempt,
  drain,
  escalate,
  markConfirmed,
  recordFailure,
  type OutboxEntry,
} from '../lib/message-outbox';
import { streamSSEViaXHR } from '../lib/sse';
import { Sentry } from '../lib/sentry';

interface SessionEntryMetadata {
  sessionId?: string;
  homeworkMode?: 'help_me' | 'check_answer';
}

interface InterviewEntryMetadata {
  subjectId?: string;
  bookId?: string;
}

function asSessionMetadata(entry: OutboxEntry): SessionEntryMetadata {
  return (entry.metadata ?? {}) as SessionEntryMetadata;
}

function asInterviewMetadata(entry: OutboxEntry): InterviewEntryMetadata {
  return (entry.metadata ?? {}) as InterviewEntryMetadata;
}

export function OutboxDrainProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const client = useApiClient();
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const runningRef = React.useRef(false);
  // [I5] Stash getToken in a ref so buildHeaders/replay/runDrain identities
  // stay stable across renders. Clerk's useAuth does not guarantee a stable
  // getToken function reference; without this, every parent re-render churns
  // runDrain and re-fires the drain useEffect, redundantly draining the
  // outbox on each render. activeProfile.id is the only meaningful trigger.
  const getTokenRef = React.useRef(getToken);
  getTokenRef.current = getToken;

  const postToSupport = React.useCallback(
    async (body: {
      entries: Array<{
        id: string;
        flow: 'session' | 'interview';
        surfaceKey: string;
        content: string;
        attempts: number;
        firstAttemptedAt: string;
        failureReason?: string;
      }>;
    }) => {
      const res = await client.support['outbox-spillover'].$post({
        json: body,
      });
      if (!res.ok) {
        throw new Error(`Support spillover failed: ${res.status}`);
      }
    },
    [client]
  );

  const buildHeaders = React.useCallback(
    async (idempotencyKey: string) => {
      const token = await getTokenRef.current();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (activeProfile?.id) headers['X-Profile-Id'] = activeProfile.id;
      if (getProxyMode()) headers['X-Proxy-Mode'] = 'true';
      return withIdempotencyKey(headers, idempotencyKey);
    },
    [activeProfile?.id]
  );

  const replaySessionEntry = React.useCallback(
    async (entry: OutboxEntry) => {
      if (!activeProfile?.id) return;
      const metadata = asSessionMetadata(entry);
      if (!metadata.sessionId) {
        await recordFailure(
          activeProfile.id,
          'session',
          entry.id,
          'missing_session_id'
        );
        return;
      }

      await beginAttempt(activeProfile.id, 'session', entry.id);
      const { events } = streamSSEViaXHR(
        `${getApiUrl()}/v1/sessions/${metadata.sessionId}/stream`,
        {
          method: 'POST',
          headers: await buildHeaders(entry.id),
          body: JSON.stringify({
            message: entry.content,
            ...(metadata.homeworkMode
              ? { homeworkMode: metadata.homeworkMode }
              : {}),
          }),
        }
      );

      let fallbackReason: string | null = null;
      for await (const event of events) {
        if (event.type === 'replay') {
          await markConfirmed(activeProfile.id, 'session', entry.id);
          return;
        }
        if (event.type === 'fallback') {
          fallbackReason = event.reason;
        }
        if (event.type === 'done') {
          if (fallbackReason) {
            await recordFailure(
              activeProfile.id,
              'session',
              entry.id,
              fallbackReason
            );
            return;
          }
          await markConfirmed(activeProfile.id, 'session', entry.id);
          return;
        }
      }
    },
    [activeProfile?.id, buildHeaders]
  );

  const replayInterviewEntry = React.useCallback(
    async (entry: OutboxEntry) => {
      if (!activeProfile?.id) return;
      const metadata = asInterviewMetadata(entry);
      if (!metadata.subjectId) {
        await recordFailure(
          activeProfile.id,
          'interview',
          entry.id,
          'missing_subject_id'
        );
        return;
      }

      await beginAttempt(activeProfile.id, 'interview', entry.id);
      const query = metadata.bookId ? `?bookId=${metadata.bookId}` : '';
      const { events } = streamSSEViaXHR(
        `${getApiUrl()}/v1/subjects/${
          metadata.subjectId
        }/interview/stream${query}`,
        {
          method: 'POST',
          headers: await buildHeaders(entry.id),
          body: JSON.stringify({ message: entry.content }),
        }
      );

      let fallbackReason: string | null = null;
      for await (const event of events) {
        if (event.type === 'replay') {
          await markConfirmed(activeProfile.id, 'interview', entry.id);
          return;
        }
        if (event.type === 'fallback') {
          fallbackReason = event.reason;
        }
        if (event.type === 'done') {
          if (fallbackReason) {
            await recordFailure(
              activeProfile.id,
              'interview',
              entry.id,
              fallbackReason
            );
            return;
          }
          await markConfirmed(activeProfile.id, 'interview', entry.id);
          return;
        }
      }
    },
    [activeProfile?.id, buildHeaders]
  );

  const runDrain = React.useCallback(async () => {
    if (!activeProfile?.id || runningRef.current) {
      return;
    }

    runningRef.current = true;
    try {
      await drain(activeProfile.id, 'session', async (entry) => {
        try {
          await replaySessionEntry(entry);
        } catch (err) {
          await recordFailure(
            activeProfile.id,
            'session',
            entry.id,
            err instanceof Error ? err.message : 'replay_failed'
          );
          Sentry.captureException(err, {
            tags: { feature: 'message_outbox', flow: 'session' },
          });
        }
      });
      await drain(activeProfile.id, 'interview', async (entry) => {
        try {
          await replayInterviewEntry(entry);
        } catch (err) {
          await recordFailure(
            activeProfile.id,
            'interview',
            entry.id,
            err instanceof Error ? err.message : 'replay_failed'
          );
          Sentry.captureException(err, {
            tags: { feature: 'message_outbox', flow: 'interview' },
          });
        }
      });

      await escalate(activeProfile.id, 'session', postToSupport).catch(
        (err) => {
          Sentry.captureException(err, {
            tags: {
              feature: 'message_outbox',
              op: 'escalate',
              flow: 'session',
            },
          });
        }
      );
      await escalate(activeProfile.id, 'interview', postToSupport).catch(
        (err) => {
          Sentry.captureException(err, {
            tags: {
              feature: 'message_outbox',
              op: 'escalate',
              flow: 'interview',
            },
          });
        }
      );
    } finally {
      runningRef.current = false;
    }
  }, [
    activeProfile?.id,
    postToSupport,
    replayInterviewEntry,
    replaySessionEntry,
  ]);

  React.useEffect(() => {
    void runDrain();
  }, [runDrain]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void runDrain();
      }
    });
    return () => sub.remove();
  }, [runDrain]);

  return <>{children}</>;
}
