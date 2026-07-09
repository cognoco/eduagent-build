import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@clerk/expo';
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

function asSessionMetadata(entry: OutboxEntry): SessionEntryMetadata {
  return (entry.metadata ?? {}) as SessionEntryMetadata;
}

export function OutboxDrainProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
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

  // [#542] Track the profileId that the currently-running drain was started
  // for. Checked on each iteration so a profile change mid-drain causes the
  // loop to break and allows a fresh drain to start for the new profile.
  const runningProfileIdRef = React.useRef<string | null>(null);

  // [#541] Hold the abort handle for the in-flight XHR so we can abort it
  // when the profile changes or the component unmounts.
  const abortXhrRef = React.useRef<(() => void) | null>(null);

  const postToSupport = React.useCallback(
    async (body: {
      entries: Array<{
        id: string;
        flow: 'session';
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
    [client],
  );

  // [#540] Accept snapshotProfileId as an explicit argument so the header
  // always reflects the profile captured at the start of runDrain, regardless
  // of any concurrent profile change that occurs while the XHR is in flight.
  const buildHeaders = React.useCallback(
    async (idempotencyKey: string, snapshotProfileId: string) => {
      const token = await getTokenRef.current();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      headers['X-Profile-Id'] = snapshotProfileId;
      if (getProxyMode()) headers['X-Proxy-Mode'] = 'true';
      return withIdempotencyKey(headers, idempotencyKey);
    },
    [],
  );

  // [#540] Accept snapshotProfileId so all outbox operations for this entry
  // use the profileId captured at drain-start, not the current closure value.
  // [#542] Accept a cancelled predicate that the caller checks before/during
  // streaming so a mid-drain profile change aborts this entry early.
  const replaySessionEntry = React.useCallback(
    async (
      entry: OutboxEntry,
      snapshotProfileId: string,
      isCancelled: () => boolean,
    ) => {
      if (isCancelled()) return;
      const metadata = asSessionMetadata(entry);
      if (!metadata.sessionId) {
        await recordFailure(
          snapshotProfileId,
          'session',
          entry.id,
          'missing_session_id',
        );
        return;
      }

      await beginAttempt(snapshotProfileId, 'session', entry.id);

      if (isCancelled()) return;

      const { events, abort } = streamSSEViaXHR(
        `${getApiUrl()}/v1/sessions/${metadata.sessionId}/stream`,
        {
          method: 'POST',
          // [#540] Headers now receive the snapshotProfileId instead of the
          // closure value so X-Profile-Id always matches the drain's profile.
          headers: await buildHeaders(entry.id, snapshotProfileId),
          body: JSON.stringify({
            message: entry.content,
            ...(metadata.homeworkMode
              ? { homeworkMode: metadata.homeworkMode }
              : {}),
          }),
        },
      );

      // [#541] Register the abort handle so runDrain can kill the XHR on
      // profile-change or unmount.
      abortXhrRef.current = abort;

      let fallbackReason: string | null = null;
      try {
        for await (const event of events) {
          // [#542] Check cancellation on every SSE event so a profile change
          // stops consuming events and aborts the XHR immediately.
          if (isCancelled()) {
            abort();
            return;
          }
          if (event.type === 'replay') {
            await markConfirmed(snapshotProfileId, 'session', entry.id);
            return;
          }
          if (event.type === 'fallback') {
            fallbackReason = event.reason;
          }
          if (event.type === 'done') {
            if (fallbackReason) {
              await recordFailure(
                snapshotProfileId,
                'session',
                entry.id,
                fallbackReason,
              );
              return;
            }
            await markConfirmed(snapshotProfileId, 'session', entry.id);
            return;
          }
        }
      } finally {
        // Clear the abort handle once the stream has finished (or thrown).
        if (abortXhrRef.current === abort) {
          abortXhrRef.current = null;
        }
      }
    },
    [buildHeaders],
  );

  const runDrain = React.useCallback(async () => {
    if (!activeProfile?.id) {
      // Expected race: drain called while activeProfile is undefined (e.g.
      // mid sign-out). Not an error — add a breadcrumb so the pattern is
      // observable in production without PII.
      Sentry.addBreadcrumb({
        category: 'outbox',
        level: 'info',
        message: 'drain skipped — no activeProfile',
        data: { isRunning: runningRef.current },
      });
      return;
    }
    if (runningRef.current) {
      return;
    }

    // [#540/#542] Snapshot the profileId once at drain-start.  Every
    // sub-call (buildHeaders, beginAttempt, markConfirmed, recordFailure)
    // receives this value so concurrent profile changes cannot contaminate
    // in-flight operations.
    const snapshotProfileId = activeProfile.id;
    runningRef.current = true;
    runningProfileIdRef.current = snapshotProfileId;

    // [#542] Cancellation flag checked inside each entry's handler and on
    // every SSE event.  Set to true when profile changes mid-drain.
    let cancelled = false;
    const isCancelled = () => cancelled;

    try {
      await drain(snapshotProfileId, 'session', async (entry) => {
        // [#542] Stop processing further entries if the profile changed.
        if (isCancelled()) return;
        try {
          await replaySessionEntry(entry, snapshotProfileId, isCancelled);
        } catch (err) {
          // If cancelled, suppress — the error is expected on abort.
          if (isCancelled()) return;
          await recordFailure(
            snapshotProfileId,
            'session',
            entry.id,
            err instanceof Error ? err.message : 'replay_failed',
          );
          Sentry.captureException(err, {
            tags: { feature: 'message_outbox', flow: 'session' },
          });
        }
      });
      if (!isCancelled()) {
        await escalate(snapshotProfileId, 'session', postToSupport).catch(
          (err) => {
            Sentry.captureException(err, {
              tags: {
                feature: 'message_outbox',
                op: 'escalate',
                flow: 'session',
              },
            });
          },
        );
      }
    } finally {
      // Only clear runningRef when it is still ours to clear — a cancelled
      // drain resets here so the new profile's drain can start immediately.
      if (runningProfileIdRef.current === snapshotProfileId) {
        runningRef.current = false;
        runningProfileIdRef.current = null;
      }
    }

    return {
      /** Exposed for tests — cancel the drain and abort any in-flight XHR. */
      _cancel: () => {
        cancelled = true;
        abortXhrRef.current?.();
        abortXhrRef.current = null;
        // Release the lock so the new profile's runDrain can proceed.
        if (runningProfileIdRef.current === snapshotProfileId) {
          runningRef.current = false;
          runningProfileIdRef.current = null;
        }
      },
    };
  }, [activeProfile?.id, postToSupport, replaySessionEntry]);

  // [#542/#541] When activeProfile.id changes, abort any in-flight XHR and
  // clear the running lock so the new profile's drain can start immediately.
  const prevProfileIdRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const prevId = prevProfileIdRef.current;
    prevProfileIdRef.current = activeProfile?.id;

    if (prevId !== undefined && prevId !== activeProfile?.id) {
      // Profile changed — cancel the in-flight drain.
      abortXhrRef.current?.();
      abortXhrRef.current = null;
      runningRef.current = false;
      runningProfileIdRef.current = null;
    }
  }, [activeProfile?.id]);

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

  // [#541] On unmount, abort any in-flight XHR so the request does not
  // continue after the provider is removed from the tree (e.g. on sign-out).
  React.useEffect(() => {
    return () => {
      abortXhrRef.current?.();
      abortXhrRef.current = null;
      runningRef.current = false;
      runningProfileIdRef.current = null;
    };
  }, []);

  return children;
}
