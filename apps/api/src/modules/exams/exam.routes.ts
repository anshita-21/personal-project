import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { optionalAuthenticate } from '../../middleware/authenticate';
import * as controller from './exam.controller';

export const examRouter = Router();

// The catalogue is readable without signing in, but a signed-in student gets
// their own attempt history folded into each row - hence optionalAuthenticate.
examRouter.get('/exams', optionalAuthenticate, asyncHandler(controller.listExams));
examRouter.get('/exams/:idOrSlug', optionalAuthenticate, asyncHandler(controller.getExam));
examRouter.get('/topics', asyncHandler(controller.listTopics));
