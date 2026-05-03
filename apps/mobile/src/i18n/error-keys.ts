const ERROR_KEY_MAP: Record<string, string> = {
  QUOTA_EXCEEDED: 'errors.quotaExhausted',
  NETWORK_ERROR: 'errors.networkError',
  NOT_FOUND: 'errors.notFound',
  FORBIDDEN: 'errors.forbidden',
  RESOURCE_GONE: 'errors.resourceGone',
  RATE_LIMITED: 'errors.rateLimited',
  UPSTREAM_ERROR: 'errors.serverError',
  UPSTREAM_LLM_ERROR: 'errors.serverError',
  BAD_REQUEST: 'errors.badRequest',
  CONFLICT: 'errors.generic',
  LLM_STREAM_ERROR: 'errors.serverError',
  LLM_ENVELOPE_ERROR: 'errors.serverError',
};

export function getLocalizedErrorKey(errorCode: string): string {
  return ERROR_KEY_MAP[errorCode] ?? 'errors.generic';
}
