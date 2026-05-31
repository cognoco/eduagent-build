export const CLERK_REQUEST_TIMEOUT_MS = 20_000;

export class ClerkRequestTimeoutError extends Error {
  constructor(public readonly operation: string) {
    super(
      `Clerk request timed out after ${CLERK_REQUEST_TIMEOUT_MS}ms: ${operation}`,
    );
    this.name = 'ClerkRequestTimeoutError';
  }
}

export function isClerkRequestTimeoutError(
  err: unknown,
): err is ClerkRequestTimeoutError {
  return err instanceof ClerkRequestTimeoutError;
}

export async function withClerkTimeout<T>(
  promise: Promise<T>,
  operation: string,
  timeoutMs = CLERK_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ClerkRequestTimeoutError(operation));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
