import type { ApiErrorCode, FieldIssue } from '@examprep/shared';

/**
 * The one error type the HTTP layer understands.
 *
 * Services throw AppError; the central error handler is the only place that
 * knows about status codes and response shapes. Anything else that escapes a
 * handler is treated as a bug and reported as INTERNAL_ERROR without leaking
 * its message to the client.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: FieldIssue[];

  constructor(status: number, code: ApiErrorCode, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details) {
      this.details = details;
    }
    Error.captureStackTrace?.(this, AppError);
  }
}

export const validationError = (message: string, details?: FieldIssue[]): AppError =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const unauthenticated = (message = 'Sign in to continue.'): AppError =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to this resource.'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found.'): AppError =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string, code: ApiErrorCode = 'CONFLICT'): AppError =>
  new AppError(409, code, message);

export const attemptAlreadyFinished = (
  message = 'This attempt has already been submitted.',
): AppError => new AppError(409, 'ATTEMPT_ALREADY_FINISHED', message);

export const attemptExpired = (message = 'Time is up for this attempt.'): AppError =>
  new AppError(409, 'ATTEMPT_EXPIRED', message);

export const examNotPublished = (message = 'This exam is not available.'): AppError =>
  new AppError(409, 'EXAM_NOT_PUBLISHED', message);

export const examNotPublishable = (message: string, details?: FieldIssue[]): AppError =>
  new AppError(422, 'EXAM_NOT_PUBLISHABLE', message, details);
