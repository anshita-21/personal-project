/**
 * The single error envelope every REST endpoint returns on failure.
 * Keeping this in the shared package means the Angular error interceptor and
 * the API error handler cannot drift apart.
 */
export interface ApiErrorBody {
  error: {
    /** Stable, machine-readable code. Safe to branch on in the client. */
    code: ApiErrorCode;
    /** Human-readable message. Safe to show to a user. */
    message: string;
    /** Field-level validation detail, present only for VALIDATION_ERROR. */
    details?: FieldIssue[];
  };
}

export interface FieldIssue {
  /** Dotted path of the offending field, e.g. "answers.0.optionId". */
  path: string;
  message: string;
}

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'ATTEMPT_ALREADY_FINISHED',
  'ATTEMPT_EXPIRED',
  'EXAM_NOT_PUBLISHED',
  'EXAM_NOT_PUBLISHABLE',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
