import { Router } from 'express';
import { createHandler } from 'graphql-http/lib/use/express';
import type { Request } from 'express';
import { optionalAuthenticate } from '../middleware/authenticate';
import { rootValue, type GraphQLContext } from './resolvers';
import { schema, typeDefs } from './schema';

export const graphqlRouter = Router();

/**
 * The same cookie authentication as REST runs in front of the GraphQL handler,
 * so there is one authentication implementation for both transports.
 * `optionalAuthenticate` is used because `me` is nullable for anonymous callers;
 * the resolvers enforce their own requirements.
 */
graphqlRouter.use(optionalAuthenticate);

/** Serves the SDL so the schema is discoverable without introspection. */
graphqlRouter.get('/schema.graphql', (_req, res) => {
  res.type('text/plain').send(typeDefs);
});

graphqlRouter.use(
  createHandler({
    schema,
    rootValue,
    // graphql-http types the context as an index-signature record, so the
    // GraphQLContext shape is widened here and narrowed again in the resolvers.
    context: (req): Record<PropertyKey, unknown> => {
      const raw = req.raw as Request;
      const context: GraphQLContext = raw.auth ? { auth: raw.auth } : {};
      return context as Record<PropertyKey, unknown>;
    },
  }),
);
