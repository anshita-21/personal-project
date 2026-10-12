import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ApiErrorCode } from '@examprep/shared';
import { API_BASE_URL, GRAPHQL_PATH } from './api.config';
import { ApiError } from './api-error';

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: {
    message: string;
    extensions?: { code?: string; http?: { status?: number } };
  }[];
}

/**
 * A ~40-line GraphQL client instead of Apollo.
 *
 * The app has exactly two queries and no mutations, subscriptions, fragments or
 * normalised cache needs, so a client library would be several hundred
 * kilobytes to replace one `fetch` and an error check. If the GraphQL surface
 * ever grows real caching requirements, this is the seam to swap.
 *
 * GraphQL answers with HTTP 200 and an `errors` array, so the error handling
 * that the REST interceptor does by status code has to happen here explicitly -
 * otherwise a permission failure would look like a successful empty response.
 */
@Injectable({ providedIn: 'root' })
export class GraphQLClient {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_BASE_URL) + GRAPHQL_PATH;

  async query<T>(
    query: string,
    variables: Record<string, unknown> = {},
    operationName?: string,
  ): Promise<T> {
    const response = await firstValueFrom(
      this.http.post<GraphQLResponse<T>>(this.url, {
        query,
        variables,
        ...(operationName ? { operationName } : {}),
      }),
    );

    const failure = response.errors?.[0];
    if (failure) {
      const code = (failure.extensions?.code ?? 'INTERNAL_ERROR') as ApiErrorCode;
      const status = failure.extensions?.http?.status ?? 400;
      throw new ApiError(status, code, failure.message);
    }

    if (response.data === null || response.data === undefined) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'The server returned an empty response.');
    }

    return response.data;
  }
}
