// ---------------------------------------------------------------------------
// Pre-auth audience carrier — device-scoped, short-lived.
//
// The pre-auth welcome chooser asks the audience question ("I want to learn"
// vs "I'm done fighting over homework") BEFORE sign-in. That answer has to
// survive the Clerk signup wall so first-profile setup can honour it without
// asking again: a `parent` choice skips the Study/Family picker and routes to
// the add-a-child screen; a `learner` choice gets a clean solo setup.
//
// Like `intro-state.ts`, SecureStore writes are async but the chooser must
// persist and immediately navigate. We pair a synchronous in-memory value
// (answers the picker decision the moment create-profile mounts in the same
// warm session) with a best-effort SecureStore write (covers a cold start
// between signup and profile setup, e.g. an email-verification round-trip).
//
// WI-2225: 'supporter' is a third, non-authorizing value carried by this
// same mechanism — first-profile setup treats it identically to 'learner'
// (clean solo setup, no family context), so intent is preserved without
// granting any extra scope.
//
// TTL: a generous 1 hour. If signup is abandoned and resumed much later the
// record expires and the user falls back to the clean learner setup — never a
// dead end (an adult can still add a child later from More → Add child).
//
// Unlike the intro-seen flag, this value IS cleared on sign-out and once
// consumed — it is transient onboarding intent, not a durable "seen" latch.
//
// Spec: docs/plans/2026-05-28-parent-audience-add-child-onboarding.md
// ---------------------------------------------------------------------------

import { getItemAsync, setItemAsync, deleteItemAsync } from './secure-storage';
import { Sentry } from './sentry';
import { track } from './analytics';
import type { WelcomeAudience } from '../components/welcome/WelcomeIntro';

// Dot-delimited so it satisfies the SecureStore key sanitizer
// (letters, digits, dot, dash, underscore).
export const PRE_AUTH_AUDIENCE_KEY = 'preAuthAudience.v1';
export const PRE_AUTH_AUDIENCE_TTL_MS = 60 * 60_000; // 1 hour

interface AudienceRecord {
  audience: WelcomeAudience;
  savedAt: number;
}

let memoryRecord: AudienceRecord | null = null;

function isFresh(savedAt: number): boolean {
  return Date.now() - savedAt < PRE_AUTH_AUDIENCE_TTL_MS;
}

function isAudience(value: unknown): value is WelcomeAudience {
  return value === 'learner' || value === 'parent' || value === 'supporter';
}

export function preAuthAudienceSecureStoreKey(): string {
  return PRE_AUTH_AUDIENCE_KEY;
}

export function markPreAuthAudienceSync(audience: WelcomeAudience): void {
  memoryRecord = { audience, savedAt: Date.now() };
  setItemAsync(PRE_AUTH_AUDIENCE_KEY, JSON.stringify(memoryRecord)).catch(
    (err) => {
      Sentry.captureException(err);
      track('audience_securestore_write_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    },
  );
}

// Synchronous read of the in-memory value only (no SecureStore). Returns null
// when absent or expired. Use this for the immediate same-session decision.
export function readPreAuthAudienceSync(): WelcomeAudience | null {
  if (memoryRecord && isFresh(memoryRecord.savedAt)) {
    return memoryRecord.audience;
  }
  return null;
}

// Async read: in-memory first, then SecureStore (cold start). Hydrates the
// in-memory cache on a SecureStore hit; deletes stale/malformed records.
export async function readPreAuthAudience(): Promise<WelcomeAudience | null> {
  const fromMemory = readPreAuthAudienceSync();
  if (fromMemory) return fromMemory;

  let raw: string | null;
  try {
    raw = await getItemAsync(PRE_AUTH_AUDIENCE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AudienceRecord>;
    if (
      typeof parsed.savedAt === 'number' &&
      isAudience(parsed.audience) &&
      isFresh(parsed.savedAt)
    ) {
      memoryRecord = { audience: parsed.audience, savedAt: parsed.savedAt };
      return parsed.audience;
    }
  } catch {
    // fall through to cleanup
  }

  await deleteItemAsync(PRE_AUTH_AUDIENCE_KEY).catch(() => undefined);
  return null;
}

export async function clearPreAuthAudience(): Promise<void> {
  memoryRecord = null;
  try {
    await deleteItemAsync(PRE_AUTH_AUDIENCE_KEY);
  } catch {
    // Non-fatal.
  }
}

export function __resetPreAuthAudienceForTests(): void {
  memoryRecord = null;
}
