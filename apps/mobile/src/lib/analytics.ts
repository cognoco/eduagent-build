import { Sentry } from './sentry';

export type HomeworkOcrGateSource = 'local' | 'server';
export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export type HomeworkOcrGateTelemetry = {
  source?: HomeworkOcrGateSource;
  tokens: number;
  words: number;
  confidence?: number;
  droppedCount?: number;
};

function emitHomeworkOcrGateEvent(
  event: string,
  payload: HomeworkOcrGateTelemetry,
): void {
  Sentry.addBreadcrumb({
    category: 'analytics.homework_ocr_gate',
    level: 'info',
    message: event,
    data: {
      ...payload,
      ...(payload.confidence == null
        ? {}
        : { confidence: Number(payload.confidence.toFixed(3)) }),
    },
  });
}

export function track(
  event: string,
  properties: AnalyticsProperties = {},
): void {
  Sentry.addBreadcrumb({
    category: 'analytics',
    level: 'info',
    message: event,
    data: {
      event,
      ...properties,
    },
  });
}

type AnalyticsHashClient = {
  analytics: {
    'hash-profile-id': {
      $post: (
        args: { json: { profileId: string } },
        options?: { headers?: Record<string, string> },
      ) => Promise<Response>;
    };
  };
};

// One-shot guard so a temporary hash endpoint failure surfaces once per
// session, not on every tap.
let unkeyedWarningEmitted = false;
const profileHashCache = new Map<string, string>();

export async function hashProfileId(
  profileId: string,
  client: AnalyticsHashClient,
): Promise<string> {
  // Guard against an empty/missing profile ID flowing in from a
  // not-yet-loaded auth state (Clerk hydration race). Surface the misuse with a
  // sentinel that won't collide with any real hash output.
  if (!profileId) {
    return 'v3_invalid_empty';
  }

  const cached = profileHashCache.get(profileId);
  if (cached) {
    return cached;
  }

  try {
    const response = await client.analytics['hash-profile-id'].$post(
      { json: { profileId } },
      { headers: { 'X-Profile-Id': profileId } },
    );
    if (!response.ok) {
      throw new Error(`hash endpoint returned ${response.status}`);
    }
    const body = (await response.json()) as { hash?: unknown };
    if (typeof body.hash !== 'string' || !/^v3_[0-9a-f]{32}$/.test(body.hash)) {
      throw new Error('hash endpoint returned an invalid hash');
    }
    profileHashCache.set(profileId, body.hash);
    return body.hash;
  } catch (e) {
    if (!unkeyedWarningEmitted) {
      unkeyedWarningEmitted = true;
      try {
        Sentry.addBreadcrumb({
          category: 'analytics.config',
          level: 'warning',
          message: 'analytics.hashProfileId: server hash unavailable',
        });
        Sentry.captureException(e);
      } catch {
        // Sentry not initialised yet (early-boot call); the next call attempts again.
        unkeyedWarningEmitted = false;
      }
    }
    return 'v3_unavailable';
  }
}

// Test-only escape hatch to reset the one-shot warning latch between
// production-path assertions. Not used in production code paths.
export const __TEST_ONLY__ = {
  resetUnkeyedWarning(): void {
    unkeyedWarningEmitted = false;
    profileHashCache.clear();
  },
};

export function bucketAccountAge(createdAt: string | null | undefined): string {
  if (!createdAt) return '0-7';
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return '0-7';
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - createdAtMs) / 86_400_000),
  );
  if (ageDays <= 7) return '0-7';
  if (ageDays <= 30) return '8-30';
  if (ageDays <= 90) return '31-90';
  return '91+';
}

export function trackHomeworkOcrGateAccepted(
  payload: HomeworkOcrGateTelemetry & { source: HomeworkOcrGateSource },
): void {
  emitHomeworkOcrGateEvent('homework_ocr_gate_accepted', payload);
}

export function trackHomeworkOcrGateRejected(
  payload: HomeworkOcrGateTelemetry & { source: HomeworkOcrGateSource },
): void {
  emitHomeworkOcrGateEvent('homework_ocr_gate_rejected', payload);
}

export function trackHomeworkOcrGateShortcircuit(
  payload: HomeworkOcrGateTelemetry,
): void {
  emitHomeworkOcrGateEvent('homework_ocr_gate_shortcircuit', payload);
}
