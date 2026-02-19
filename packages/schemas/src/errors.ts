import { z } from 'zod';

// Common error codes — single source of truth
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  CONSENT_PENDING: 'CONSENT_PENDING',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  MISSING_SIGNATURE: 'MISSING_SIGNATURE',
  STALE_EVENT: 'STALE_EVENT',
  SUBJECT_INACTIVE: 'SUBJECT_INACTIVE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const errorCodeValues = Object.values(ERROR_CODES) as [
  ErrorCode,
  ...ErrorCode[]
];
export const errorCodeSchema = z.enum(errorCodeValues);

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
