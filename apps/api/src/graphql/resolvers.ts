import { GraphQLError } from 'graphql';
import type { Role } from '@examprep/shared';
import { getStudentDashboard } from '../modules/dashboard/dashboard.service';
import { getAdminStats } from '../modules/admin/admin.service';
import { getProfile } from '../modules/auth/auth.service';

export interface GraphQLContext {
  auth?: { userId: string; role: Role; sessionId: string };
}

/**
 * GraphQL has no status codes, so authorization failures are surfaced as
 * GraphQLErrors carrying the same `code` values the REST envelope uses. The
 * Angular client branches on that code regardless of transport.
 */
function unauthenticated(): GraphQLError {
  return new GraphQLError('Sign in to continue.', {
    extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
  });
}

function forbidden(): GraphQLError {
  return new GraphQLError('This action requires a different role.', {
    extensions: { code: 'FORBIDDEN', http: { status: 403 } },
  });
}

function requireAuth(context: GraphQLContext): NonNullable<GraphQLContext['auth']> {
  if (!context.auth) {
    throw unauthenticated();
  }
  return context.auth;
}

/**
 * Root resolvers.
 *
 * Note what is NOT here: no `studentDashboard(userId: ID!)`. The dashboard is
 * always resolved for the authenticated caller, so there is no argument an
 * attacker could point at another learner. Authorization by construction beats
 * authorization by check.
 */
export const rootValue = {
  me: async (_args: unknown, context: GraphQLContext) => {
    if (!context.auth) {
      return null;
    }
    return getProfile(context.auth.userId);
  },

  studentDashboard: async (_args: unknown, context: GraphQLContext) => {
    const auth = requireAuth(context);
    return getStudentDashboard(auth.userId);
  },

  adminStats: async (_args: unknown, context: GraphQLContext) => {
    const auth = requireAuth(context);
    if (auth.role !== 'ADMIN') {
      throw forbidden();
    }
    return getAdminStats();
  },
};
