import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError, forbidden, notFound, validationError } from '../errors/app-error';
import { toErrorResponse } from './error-handler';

describe('toErrorResponse', () => {
  it('passes an AppError through with its own status and code', () => {
    const { status, body } = toErrorResponse(forbidden('Nope.'));
    expect(status).toBe(403);
    expect(body.error).toEqual({ code: 'FORBIDDEN', message: 'Nope.' });
  });

  it('includes field details when the AppError carries them', () => {
    const { body } = toErrorResponse(
      validationError('Bad input.', [{ path: 'email', message: 'Required.' }]),
    );
    expect(body.error.details).toEqual([{ path: 'email', message: 'Required.' }]);
  });

  it('maps a ZodError to 400 with a flattened field path', () => {
    const schema = z.object({ profile: z.object({ age: z.number().min(18) }) });
    const parsed = schema.safeParse({ profile: { age: 2 } });
    expect(parsed.success).toBe(false);

    const { status, body } = toErrorResponse(parsed.success ? null : parsed.error);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]?.path).toBe('profile.age');
  });

  it('maps a Prisma unique-constraint violation to 409', () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(toErrorResponse(error).status).toBe(409);
    expect(toErrorResponse(error).body.error.code).toBe('CONFLICT');
  });

  it('maps a Prisma missing-record error to 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError('gone', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(toErrorResponse(error).status).toBe(404);
    expect(toErrorResponse(error).body.error.code).toBe('NOT_FOUND');
  });

  it('maps an oversized body to 413', () => {
    expect(toErrorResponse({ type: 'entity.too.large' }).status).toBe(413);
    expect(toErrorResponse({ type: 'entity.too.large' }).body.error.code).toBe(
      'PAYLOAD_TOO_LARGE',
    );
  });

  it('falls back to 500 INTERNAL_ERROR for anything unrecognised', () => {
    const { status, body } = toErrorResponse(new Error('kaboom'));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('keeps an unknown non-Error value from leaking into the response', () => {
    const { status, body } = toErrorResponse('a bare string');
    expect(status).toBe(500);
    expect(body.error.message).not.toContain('a bare string');
  });

  it('preserves custom status codes on AppError subclass usage', () => {
    expect(toErrorResponse(new AppError(422, 'EXAM_NOT_PUBLISHABLE', 'nope')).status).toBe(422);
    expect(toErrorResponse(notFound()).status).toBe(404);
  });
});
