import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { authenticate, requireRole } from '../../middleware/authenticate';
import { adminWriteLimiter } from '../../middleware/rate-limit';
import * as controller from './admin.controller';

export const adminRouter = Router();

// The authorization boundary for every privileged operation. Applied to the
// router rather than to individual routes so that adding a route cannot
// accidentally leave it ungated. The Angular admin guard is UX only.
adminRouter.use(authenticate, requireRole('ADMIN'));

adminRouter.get('/stats', asyncHandler(controller.stats));

adminRouter.get('/exams', asyncHandler(controller.listExams));
adminRouter.post('/exams', adminWriteLimiter, asyncHandler(controller.createExam));
adminRouter.get('/exams/:id', asyncHandler(controller.getExam));
adminRouter.patch('/exams/:id', adminWriteLimiter, asyncHandler(controller.updateExam));
adminRouter.delete('/exams/:id', adminWriteLimiter, asyncHandler(controller.deleteExam));

adminRouter.get('/exams/:id/questions', asyncHandler(controller.getExamQuestions));
adminRouter.put(
  '/exams/:id/questions',
  adminWriteLimiter,
  asyncHandler(controller.replaceQuestions),
);

adminRouter.get('/exams/:id/publish-check', asyncHandler(controller.publishCheck));
adminRouter.post('/exams/:id/publish', adminWriteLimiter, asyncHandler(controller.publish));
adminRouter.post('/exams/:id/archive', adminWriteLimiter, asyncHandler(controller.archive));
adminRouter.post('/exams/:id/unpublish', adminWriteLimiter, asyncHandler(controller.unpublish));

adminRouter.post('/topics', adminWriteLimiter, asyncHandler(controller.createTopic));
