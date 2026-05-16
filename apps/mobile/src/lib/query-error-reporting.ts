function isServiceUnavailableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    'code' in error &&
    'status' in error &&
    (error as { name?: unknown }).name === 'UpstreamError' &&
    (error as { code?: unknown }).code === 'SERVICE_UNAVAILABLE' &&
    (error as { status?: unknown }).status === 503
  );
}

export function shouldReportQueryErrorToSentry(error: unknown): boolean {
  if (isServiceUnavailableError(error)) {
    return false;
  }

  return true;
}
