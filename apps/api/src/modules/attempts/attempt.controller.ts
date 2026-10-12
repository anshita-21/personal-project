import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  attemptHistoryQuerySchema,
  idSchema,
  saveAnswersSchema,
  startAttemptSchema,
  submitAttemptSchema,
} from '@examprep/shared';
import { parseBody, parseParams, parseQuery } from '../../middleware/validate';
import { unauthenticated } from '../../errors/app-error';
import * as attemptService from './attempt.service';

const attemptParams = z.object({ id: idSchema });

function authOf(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) {
    throw unauthenticated();
  }
  return req.auth;
}

export async function startAttempt(req: Request, res: Response): Promise<void> {
  const auth = authOf(req);
  const { examId } = parseBody(req, startAttemptSchema);
  const state = await attemptService.startAttempt(auth.userId, examId);
  // 200, not 201: the call is idempotent and may be resuming an existing
  // attempt rather than creating one.
  res.status(200).json(state);
}

export async function getAttempt(req: Request, res: Response): Promise<void> {
  const auth = authOf(req);
  const { id } = parseParams(req, attemptParams);
  res.json(await attemptService.getAttemptState(auth.userId, id));
}

export async function saveAnswers(req: Request, res: Response): Promise<void> {
  const auth = authOf(req);
  const { id } = parseParams(req, attemptParams);
  const { answers } = parseBody(req, saveAnswersSchema);
  res.json(await attemptService.saveAnswers(auth.userId, id, answers));
}

export async function submitAttempt(req: Request, res: Response): Promise<void> {
  const auth = authOf(req);
  const { id } = parseParams(req, attemptParams);
  const { answers } = parseBody(req, submitAttemptSchema);
  res.json(await attemptService.submitAttempt(auth.userId, id, answers));
}

export async function getResult(req: Request, res: Response): Promise<void> {
  const auth = authOf(req);
  const { id } = parseParams(req, attemptParams);
  res.json(await attemptService.getAttemptResult(auth.userId, id));
}

export async function listAttempts(req: Request, res: Response): Promise<void> {
  const auth = authOf(req);
  const query = parseQuery(req, attemptHistoryQuerySchema);
  res.json(await attemptService.listAttempts(auth.userId, query));
}
