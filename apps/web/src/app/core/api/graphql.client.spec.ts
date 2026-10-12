import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { testProviders } from '../../../testing/test-setup';
import type { ApiError } from './api-error';
import { GraphQLClient } from './graphql.client';

describe('GraphQLClient', () => {
  let client: GraphQLClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: testProviders() });
    client = TestBed.inject(GraphQLClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the query, variables and operation name to /graphql', async () => {
    const promise = client.query<{ ok: boolean }>('{ ok }', { id: '1' }, 'Thing');
    const request = http.expectOne('/graphql');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      query: '{ ok }',
      variables: { id: '1' },
      operationName: 'Thing',
    });
    request.flush({ data: { ok: true } });

    await expect(promise).resolves.toEqual({ ok: true });
  });

  /**
   * The behaviour that matters: GraphQL answers HTTP 200 with an `errors`
   * array, so without this translation a FORBIDDEN would look like a
   * successful empty response and the UI would render an empty dashboard.
   */
  it('turns a GraphQL error into an ApiError carrying its code and status', async () => {
    const promise = client.query('{ adminStats { totalUsers } }');
    http.expectOne('/graphql').flush({
      data: null,
      errors: [
        {
          message: 'This action requires a different role.',
          extensions: { code: 'FORBIDDEN', http: { status: 403 } },
        },
      ],
    });

    await expect(promise).rejects.toMatchObject({
      name: 'ApiError',
      code: 'FORBIDDEN',
      status: 403,
      message: 'This action requires a different role.',
    });
  });

  it('defaults the status when the error carries no http extension', async () => {
    const promise = client.query('{ nope }');
    http.expectOne('/graphql').flush({
      errors: [{ message: 'Cannot query field "nope".' }],
    });

    const error = (await promise.catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('rejects when the response has neither data nor errors', async () => {
    const promise = client.query('{ ok }');
    http.expectOne('/graphql').flush({});

    await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('propagates a transport-level failure as an ApiError', async () => {
    const promise = client.query('{ ok }');
    http
      .expectOne('/graphql')
      .flush({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }, {
        status: 500,
        statusText: 'Server Error',
      });

    await expect(promise).rejects.toMatchObject({ status: 500 });
  });
});
