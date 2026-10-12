import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  adminExamQuerySchema,
  examInputSchema,
  examQuestionsInputSchema,
  idSchema,
  topicInputSchema,
} from '@examprep/shared';
import { parseBody, parseParams, parseQuery } from '../../middleware/validate';
import { unauthenticated } from '../../errors/app-error';
import * as examService from '../exams/exam.service';
import * as adminService from './admin.service';

const examParams = z.object({ id: idSchema });

function authOf(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) {
    throw unauthenticated();
  }
  return req.auth;
}

export async function stats(_req: Request, res: Response): Promise<void> {
  res.json(await adminService.getAdminStats());
}

export async function listExams(req: Request, res: Response): Promise<void> {
  const query = parseQuery(req, adminExamQuerySchema);
  res.json(await examService.listExamsForAdmin(query));
}

export async function getExam(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(req, examParams);
  res.json(await examService.getExamDetailForAdmin(id));
}

export async function getExamQuestions(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(req, examParams);
  res.json(await adminService.getExamQuestionsForAdmin(id));
}

export async function createExam(req: Request, res: Response): Promise<void> {
  const auth = authOf(req);
  const input = parseBody(req, examInputSchema);
  res.status(201).json(await adminService.createExam(input, auth.userId));
}

export async function updateExam(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(req, examParams);
  const input = parseBody(req, examInputSchema);
  res.json(await adminService.updateExam(id, input));
}

export async function replaceQuestions(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(req, examParams);
  const input = parseBody(req, examQuestionsInputSchema);
  res.json(await adminService.replaceExamQuestions(id, input));
}

export async function publishCheck(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(req, examParams);
  res.json(await adminService.publishChecks(id));
}

export async function publish(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(req, examParams);
  res.json(await adminService.publishExam(id));
}

export async function archive(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(req, examParams);
  res.json(await adminService.setExamStatus(id, 'ARCHIVED'));
}

export async function unpublish(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(req, examParams);
  res.json(await adminService.setExamStatus(id, 'DRAFT'));
}

export async function deleteExam(req: Request, res: Response): Promise<void> {
  const { id } = parseParams(req, examParams);
  await adminService.deleteExam(id);
  res.status(204).send();
}

export async function createTopic(req: Request, res: Response): Promise<void> {
  const input = parseBody(req, topicInputSchema);
  res.status(201).json(await adminService.createTopic(input));
}
