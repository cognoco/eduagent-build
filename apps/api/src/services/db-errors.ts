// Postgres SQLSTATE for a unique_violation.
const UNIQUE_VIOLATION = '23505';

// Bound the cause walk so a pathological self-referential chain can't loop.
const MAX_CAUSE_DEPTH = 10;

/**
 * Resolve the underlying database driver error from whatever the ORM threw.
 *
 * drizzle-orm >=0.44 wraps every driver error raised during query execution in
 * a `DrizzleQueryError`, moving the original Postgres error — with its `.code`
 * and `.constraint` — onto `error.cause`. Pre-0.44 the raw driver error
 * propagated directly. Code that branches on the Postgres error code must read
 * it from the driver error regardless of how many wrapper layers sit on top.
 *
 * Walk the `.cause` chain and return the first node that carries a string
 * SQLSTATE `.code` (the driver error). If none is found, return the original
 * error unchanged so callers can fall through to their generic handling.
 */
export function unwrapDbError(error: unknown): unknown {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (
      typeof current === 'object' &&
      current !== null &&
      'code' in current &&
      typeof (current as { code?: unknown }).code === 'string'
    ) {
      return current;
    }
    const cause =
      typeof current === 'object' && current !== null
        ? (current as { cause?: unknown }).cause
        : undefined;
    if (cause === undefined || cause === null || cause === current) break;
    current = cause;
  }
  return error;
}

/**
 * True iff `error` (or the driver error it wraps) is a Postgres unique
 * violation (SQLSTATE 23505). Robust to drizzle's `DrizzleQueryError` wrapping.
 */
export function isUniqueViolation(error: unknown): boolean {
  const unwrapped = unwrapDbError(error);
  return (
    typeof unwrapped === 'object' &&
    unwrapped !== null &&
    (unwrapped as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * For a Postgres unique violation, return the violated constraint name (or `''`
 * when the driver did not populate one); `null` when `error` is not a unique
 * violation. Robust to drizzle's `DrizzleQueryError` wrapping. Callers
 * discriminate on the constraint name to decide idempotent-replay vs. conflict.
 */
export function uniqueViolationConstraint(error: unknown): string | null {
  const unwrapped = unwrapDbError(error);
  if (
    typeof unwrapped === 'object' &&
    unwrapped !== null &&
    (unwrapped as { code?: unknown }).code === UNIQUE_VIOLATION
  ) {
    const constraint = (unwrapped as { constraint?: unknown }).constraint;
    return typeof constraint === 'string' ? constraint : '';
  }
  return null;
}
