import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate';
import { authLimiter, registerLimiter } from '../../middleware/rate-limit';
import * as controller from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', registerLimiter, asyncHandler(controller.register));
authRouter.post('/login', authLimiter, asyncHandler(controller.login));

// Logout tolerates an already-invalid cookie (optionalAuthenticate) so that
// signing out never fails with a 401 - the client's goal is "be signed out",
// and a 401 here would leave a stale cookie in the browser.
authRouter.post('/logout', optionalAuthenticate, asyncHandler(controller.logout));
authRouter.post('/logout-all', authenticate, asyncHandler(controller.logoutEverywhere));

authRouter.get('/me', authenticate, asyncHandler(controller.me));
authRouter.patch('/me', authenticate, asyncHandler(controller.updateProfile));
authRouter.post(
  '/me/password',
  authenticate,
  authLimiter,
  asyncHandler(controller.changePassword),
);
