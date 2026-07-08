import { Sentry } from '../../lib/sentry';

export function reportHomeworkMetadataSyncFailure(
  scope: 'next_problem' | 'ensure_session',
  err: unknown,
  sessionId?: string,
): void {
  const scopeLabel = scope === 'next_problem' ? '' : ' during ensureSession';
  console.warn(`[Session] Homework metadata sync failed${scopeLabel}:`, err);
  Sentry.captureException(err, {
    tags: {
      surface: 'session',
      feature: 'homework_metadata_sync',
      sync_scope: scope,
      ...(sessionId ? { sessionId } : {}),
    },
  });
}
