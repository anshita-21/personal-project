import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { ApiErrorBody, FieldIssue } from '@examprep/shared';
import { AppError } from '../errors/app-error';
import { isProduction } from '../config/env';
import { logger } from '../logger';

function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Translates every failure into the single ApiErrorBody envelope.
 *
 * Mapping rules, in order of specificity:
 *   AppError            -> its own status/code (the normal path)
 *   ZodError            -> 400 VALIDATION_ERROR with field details
 *   Prisma P2002        -> 409 CONFLICT   (unique constraint)
 *   Prisma P2025        -> 404 NOT_FOUND  (record required but missing)
 *   body-parser entity.too.large -> 413
 *   anything else       -> 500 INTERNAL_ERROR, message withheld in production
 */
export function toErrorResponse(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request contains invalid data.',
          details: zodIssues(error),
        },
      },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return {
        status: 409,
        body: { error: { code: 'CONFLICT', message: 'That record already exists.' } },
      };
    }
    if (error.code === 'P2025') {
      return {
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Resource not found.' } },
      };
    }
  }

  const type = (error as { type?: string } | null)?.type;
  if (type === 'entity.too.large') {
    return {
      status: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } },
    };
  }

  const message =
    !isProduction && error instanceof Error ? error.message : 'Something went wrong on our side.';
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message } } };
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const { status, body } = toErrorResponse(error);

  // 5xx is our bug; 4xx is the caller's. Log them at different levels so alerts
  // can fire on the former without drowning in the latter.
  const logPayload = {
    method: req.method,
    url: req.originalUrl,
    status,
    code: body.error.code,
    userId: req.auth?.userId,
  };
  if (status >= 500) {
    logger.error({ ...logPayload, err: error }, 'request failed');
  } else {
    logger.info(logPayload, 'request rejected');
  }

  res.status(status).json(body);
};

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: `Cannot ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
};
