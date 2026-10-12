import type { Request, Response } from 'express';
import { z } from 'zod';
import { examQuerySchema, idSchema } from '@examprep/shared';
import { parseParams, parseQuery } from '../../middleware/validate';
import * as examService from './exam.service';

const idOrSlugParams = z.object({ idOrSlug: z.string().trim().min(1).max(200) });

export async function listExams(req: Request, res: Response): Promise<void> {
  const query = parseQuery(req, examQuerySchema);
  res.json(await examService.listPublishedExams(query, req.auth?.userId ?? null));
}

export async function getExam(req: Request, res: Response): Promise<void> {
  const { idOrSlug } = parseParams(req, idOrSlugParams);
  res.json(await examService.getPublishedExamDetail(idOrSlug, req.auth?.userId ?? null));
}

export async function listTopics(_req: Request, res: Response): Promise<void> {
  res.json(await examService.listTopics());
}

export const examParamsSchema = z.object({ id: idSchema });
