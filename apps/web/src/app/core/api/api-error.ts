import type { ApiErrorBody, ApiErrorCode, FieldIssue } from '@examprep/shared';

/**
 * The single error type the whole frontend works with.
 *
 * The HTTP interceptor converts every failure - a REST error envelope, a
 * GraphQL error, a network timeout, an unparseable response - into one of
 * these, so components branch on `code` and never have to inspect
 * HttpErrorResponse shapes.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: FieldIssue[];

  constructor(status: number, code: ApiErrorCode, message: string, details: FieldIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level message for a form control, if the API returned one. */
  detailFor(path: string): string | undefined {
    return this.details.find((issue) => issue.path === path)?.message;
  }

  static isApiError(value: unknown): value is ApiError {
    return value instanceof ApiError;
  }

  /** Builds an ApiError from an unknown error body, never throwing itself. */
  static from(status: number, body: unknown, fallback: string): ApiError {
    const envelope = body as ApiErrorBody | null;
    const error = envelope?.error;
    if (error && typeof error.code === 'string' && typeof error.message === 'string') {
      return new ApiError(status, error.code, error.message, error.details ?? []);
    }
    return new ApiError(status, status === 0 ? 'INTERNAL_ERROR' : 'INTERNAL_ERROR', fallback);
  }
}

/** Human-readable fallbacks, used when the server could not be reached at all. */
export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and try again.';
