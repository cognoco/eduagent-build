export interface ClerkError {
  message?: string;
  longMessage?: string;
}

export function extractClerkError(
  err: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  const clerkErrors = (err as { errors?: ClerkError[] }).errors;
  return clerkErrors?.[0]?.longMessage ?? clerkErrors?.[0]?.message ?? fallback;
}
