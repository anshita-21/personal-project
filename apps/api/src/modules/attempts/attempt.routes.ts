import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './attempt.controller';

export const attemptRouter = Router();

// Everything here is per-learner data: authenticate once for the whole router
// so a new route cannot accidentally be added unprotected.
//
// The router is mounted on its own prefix (/api/v1/attempts) rather than on
// /api/v1. Router-level middleware runs for every path under the mount point,
// including ones that match no route - mounting it broadly would make every
// unknown /api/v1/* URL answer 401 instead of 404.
attemptRouter.use(authenticate);

attemptRouter.post('/', asyncHandler(controller.startAttempt));
attemptRouter.get('/', asyncHandler(controller.listAttempts));
attemptRouter.get('/:id', asyncHandler(controller.getAttempt));
attemptRouter.patch('/:id/answers', asyncHandler(controller.saveAnswers));
attemptRouter.post('/:id/submit', asyncHandler(controller.submitAttempt));
attemptRouter.get('/:id/result', asyncHandler(controller.getResult));
