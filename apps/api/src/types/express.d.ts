import type { Role } from '@examprep/shared';

/**
 * Request augmentation for the authenticated principal.
 *
 * Only `authenticate` writes this. Handlers read it, so a route that forgets
 * the middleware fails type-safely (`req.auth` is possibly undefined) instead
 * of silently trusting a header.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
        sessionId: string;
      };
    }
  }
}

export {};
