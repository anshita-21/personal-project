/**
 * OpenAPI 3.1 description of the REST surface, served at GET /api/docs.
 *
 * This document is hand-written rather than generated. The trade-off is
 * honest: generation from Zod would remove the risk of drift, but it adds a
 * dependency and couples the public contract to internal schema shapes. Instead
 * the risk is covered by a test - `openapi.spec.ts` walks the live Express
 * router and fails if any registered route is missing from this document (or
 * vice versa), so drift breaks the build rather than misleading a reader.
 */

const ERROR_RESPONSE = {
  description: 'Error envelope',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
} as const;

function errors(...codes: number[]): Record<string, typeof ERROR_RESPONSE> {
  return Object.fromEntries(codes.map((code) => [String(code), ERROR_RESPONSE]));
}

function jsonResponse(ref: string, description: string) {
  return {
    description,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
  };
}

function jsonBody(ref: string) {
  return {
    required: true,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
  };
}

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
} as const;

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Exam Prep & Assessment Platform API',
    version: '1.0.0',
    description: [
      'REST API for the Exam Prep platform.',
      '',
      '**Authentication** is a signed, httpOnly session cookie (`examprep_session`).',
      'Call `POST /api/v1/auth/login` or `/register`; the browser stores the cookie and',
      'sends it automatically. Requests from a browser must be made with credentials',
      'included. There is no bearer-token mode.',
      '',
      '**Errors** always use the same envelope:',
      '`{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }`.',
      'Branch on `code`, never on the message text.',
      '',
      'The learner dashboard is served over GraphQL at `POST /graphql` - see',
      '`GET /graphql/schema.graphql` and docs/api.md.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'Current origin' }],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Catalogue' },
    { name: 'Attempts' },
    { name: 'Admin' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness and database connectivity probe',
        security: [],
        responses: {
          '200': jsonResponse('Health', 'Service is healthy'),
          '503': jsonResponse('Health', 'Database unreachable'),
        },
      },
    },

    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create a student account and start a session',
        security: [],
        requestBody: jsonBody('RegisterInput'),
        responses: {
          '201': jsonResponse('AuthResponse', 'Account created; session cookie set'),
          ...errors(400, 409, 429),
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Start a session',
        security: [],
        requestBody: jsonBody('LoginInput'),
        responses: {
          '200': jsonResponse('AuthResponse', 'Session cookie set'),
          ...errors(400, 401, 429),
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke the current session',
        security: [],
        responses: { '204': { description: 'Signed out' } },
      },
    },
    '/api/v1/auth/logout-all': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke every session of the account',
        responses: { '204': { description: 'All sessions revoked' }, ...errors(401) },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The signed-in account',
        responses: { '200': jsonResponse('AuthResponse', 'Current account'), ...errors(401) },
      },
      patch: {
        tags: ['Auth'],
        summary: 'Update the display name',
        requestBody: jsonBody('UpdateProfileInput'),
        responses: {
          '200': jsonResponse('AuthResponse', 'Updated account'),
          ...errors(400, 401),
        },
      },
    },
    '/api/v1/auth/me/password': {
      post: {
        tags: ['Auth'],
        summary: 'Change the password (revokes every other session)',
        requestBody: jsonBody('ChangePasswordInput'),
        responses: { '204': { description: 'Password changed' }, ...errors(400, 401, 429) },
      },
    },

    '/api/v1/topics': {
      get: {
        tags: ['Catalogue'],
        summary: 'All topics, for catalogue filters',
        security: [],
        responses: {
          '200': {
            description: 'Topics',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Topic' } },
              },
            },
          },
        },
      },
    },
    '/api/v1/exams': {
      get: {
        tags: ['Catalogue'],
        summary: 'Published exams, paginated',
        description:
          'Only PUBLISHED exams are returned. When a session cookie is present, each row is enriched with that learner\'s bestPercentage, attemptCount and activeAttemptId.',
        security: [],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 9 },
          },
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 120 } },
          { name: 'topicId', in: 'query', schema: { type: 'string' } },
          {
            name: 'difficulty',
            in: 'query',
            schema: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
          },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['title', 'createdAt', 'durationMinutes', 'difficulty'],
              default: 'createdAt',
            },
          },
          {
            name: 'order',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: { '200': jsonResponse('PaginatedExamSummary', 'Page of exams'), ...errors(400) },
      },
    },
    '/api/v1/exams/{idOrSlug}': {
      get: {
        tags: ['Catalogue'],
        summary: 'A published exam by id or slug',
        security: [],
        parameters: [
          { name: 'idOrSlug', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': jsonResponse('ExamDetail', 'Exam detail'), ...errors(404) },
      },
    },

    '/api/v1/attempts': {
      post: {
        tags: ['Attempts'],
        summary: 'Start - or resume - an attempt',
        description:
          'Idempotent. If the learner already has an unfinished attempt at this exam it is returned instead of creating a second one. If that attempt\'s deadline has passed it is graded as EXPIRED first and a fresh attempt is created.',
        requestBody: jsonBody('StartAttemptInput'),
        responses: {
          '200': jsonResponse('AttemptState', 'Attempt state to render'),
          ...errors(400, 401, 404, 409),
        },
      },
      get: {
        tags: ['Attempts'],
        summary: "The caller's own attempt history",
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          },
          { name: 'examId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': jsonResponse('PaginatedAttemptResult', 'Page of attempts'),
          ...errors(400, 401),
        },
      },
    },
    '/api/v1/attempts/{id}': {
      get: {
        tags: ['Attempts'],
        summary: 'Resume an in-progress attempt',
        description:
          'Returns questions WITHOUT the answer key, plus server-authoritative remainingSeconds. Returns 409 ATTEMPT_ALREADY_FINISHED or ATTEMPT_EXPIRED for a closed attempt, and 404 for an attempt owned by another learner.',
        parameters: [idParam],
        responses: {
          '200': jsonResponse('AttemptState', 'Attempt state'),
          ...errors(401, 404, 409),
        },
      },
    },
    '/api/v1/attempts/{id}/answers': {
      patch: {
        tags: ['Attempts'],
        summary: 'Autosave a batch of answers',
        description:
          'Upsert keyed on (attempt, question), so a retried flush overwrites rather than duplicating. `optionId: null` clears a selection. Rejected with 409 ATTEMPT_EXPIRED once the deadline has passed.',
        parameters: [idParam],
        requestBody: jsonBody('SaveAnswersInput'),
        responses: {
          '200': jsonResponse('SaveAnswersResult', 'Saved'),
          ...errors(400, 401, 404, 409),
        },
      },
    },
    '/api/v1/attempts/{id}/submit': {
      post: {
        tags: ['Attempts'],
        summary: 'Submit and grade an attempt',
        description:
          'Idempotent: submitting an already-graded attempt returns the stored result rather than re-grading. Answers sent after the deadline are discarded and the attempt is graded as EXPIRED.',
        parameters: [idParam],
        requestBody: jsonBody('SubmitAttemptInput'),
        responses: {
          '200': jsonResponse('AttemptResultSummary', 'Graded result'),
          ...errors(400, 401, 404),
        },
      },
    },
    '/api/v1/attempts/{id}/result': {
      get: {
        tags: ['Attempts'],
        summary: 'Full result with the answer key and explanations',
        description:
          'Available only for a terminal attempt owned by the caller. An in-progress attempt returns 409.',
        parameters: [idParam],
        responses: {
          '200': jsonResponse('AttemptResultDetail', 'Result with review'),
          ...errors(401, 404, 409),
        },
      },
    },

    '/api/v1/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Platform and assessment statistics',
        responses: { '200': jsonResponse('AdminStats', 'Statistics'), ...errors(401, 403) },
      },
    },
    '/api/v1/admin/exams': {
      get: {
        tags: ['Admin'],
        summary: 'All exams in any status',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'topicId', in: 'query', schema: { type: 'string' } },
          {
            name: 'difficulty',
            in: 'query',
            schema: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
          },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: {
          '200': jsonResponse('PaginatedAdminExamSummary', 'Page of exams'),
          ...errors(400, 401, 403),
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Create a draft exam',
        requestBody: jsonBody('ExamInput'),
        responses: {
          '201': jsonResponse('ExamDetail', 'Created exam'),
          ...errors(400, 401, 403),
        },
      },
    },
    '/api/v1/admin/exams/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'An exam in any status',
        parameters: [idParam],
        responses: {
          '200': jsonResponse('ExamDetail', 'Exam detail'),
          ...errors(401, 403, 404),
        },
      },
      patch: {
        tags: ['Admin'],
        summary: 'Update exam metadata',
        parameters: [idParam],
        requestBody: jsonBody('ExamInput'),
        responses: {
          '200': jsonResponse('ExamDetail', 'Updated exam'),
          ...errors(400, 401, 403, 404),
        },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Delete an exam that has never been attempted',
        parameters: [idParam],
        responses: {
          '204': { description: 'Deleted' },
          ...errors(401, 403, 404, 409),
        },
      },
    },
    '/api/v1/admin/exams/{id}/questions': {
      get: {
        tags: ['Admin'],
        summary: 'Questions with the answer key (authoring view)',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'Questions',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/AdminQuestion' } },
              },
            },
          },
          ...errors(401, 403, 404),
        },
      },
      put: {
        tags: ['Admin'],
        summary: 'Replace the whole question set in one transaction',
        parameters: [idParam],
        requestBody: jsonBody('ExamQuestionsInput'),
        responses: {
          '200': jsonResponse('ExamDetail', 'Updated exam'),
          ...errors(400, 401, 403, 404),
        },
      },
    },
    '/api/v1/admin/exams/{id}/publish-check': {
      get: {
        tags: ['Admin'],
        summary: 'Why this exam can or cannot be published',
        parameters: [idParam],
        responses: {
          '200': jsonResponse('ExamPublishCheck', 'Publish readiness'),
          ...errors(401, 403, 404),
        },
      },
    },
    '/api/v1/admin/exams/{id}/publish': {
      post: {
        tags: ['Admin'],
        summary: 'Publish an exam',
        parameters: [idParam],
        responses: {
          '200': jsonResponse('ExamDetail', 'Published exam'),
          ...errors(401, 403, 404, 422),
        },
      },
    },
    '/api/v1/admin/exams/{id}/archive': {
      post: {
        tags: ['Admin'],
        summary: 'Archive an exam (hides it from the catalogue, keeps results)',
        parameters: [idParam],
        responses: {
          '200': jsonResponse('ExamDetail', 'Archived exam'),
          ...errors(401, 403, 404),
        },
      },
    },
    '/api/v1/admin/exams/{id}/unpublish': {
      post: {
        tags: ['Admin'],
        summary: 'Return a published exam to draft',
        parameters: [idParam],
        responses: {
          '200': jsonResponse('ExamDetail', 'Draft exam'),
          ...errors(401, 403, 404),
        },
      },
    },
    '/api/v1/admin/topics': {
      post: {
        tags: ['Admin'],
        summary: 'Create a topic',
        requestBody: jsonBody('TopicInput'),
        responses: {
          '201': jsonResponse('Topic', 'Created topic'),
          ...errors(400, 401, 403, 409),
        },
      },
    },
  },

  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'examprep_session' },
    },
    schemas: {
      ApiError: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_ERROR',
                  'UNAUTHENTICATED',
                  'FORBIDDEN',
                  'NOT_FOUND',
                  'CONFLICT',
                  'ATTEMPT_ALREADY_FINISHED',
                  'ATTEMPT_EXPIRED',
                  'EXAM_NOT_PUBLISHED',
                  'EXAM_NOT_PUBLISHABLE',
                  'RATE_LIMITED',
                  'PAYLOAD_TOO_LARGE',
                  'INTERNAL_ERROR',
                ],
              },
              message: { type: 'string' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['path', 'message'],
                  properties: { path: { type: 'string' }, message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      Health: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'] },
          uptimeSeconds: { type: 'number' },
          database: { type: 'string', enum: ['up', 'down'] },
          version: { type: 'string' },
        },
      },
      User: {
        type: 'object',
        required: ['id', 'name', 'email', 'role', 'createdAt'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['STUDENT', 'ADMIN'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthResponse: {
        type: 'object',
        required: ['user'],
        properties: { user: { $ref: '#/components/schemas/User' } },
      },
      RegisterInput: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 80 },
          email: { type: 'string', format: 'email' },
          password: {
            type: 'string',
            minLength: 10,
            description: 'At least 10 characters, including one letter and one number.',
          },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      UpdateProfileInput: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 2, maxLength: 80 } },
      },
      ChangePasswordInput: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 10 },
        },
      },
      Topic: {
        type: 'object',
        required: ['id', 'name', 'slug'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: ['string', 'null'] },
        },
      },
      TopicInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 60 },
          description: { type: 'string', maxLength: 400 },
        },
      },
      ExamSummary: {
        type: 'object',
        required: [
          'id',
          'slug',
          'title',
          'description',
          'difficulty',
          'durationMinutes',
          'passPercentage',
          'questionCount',
          'totalPoints',
          'topic',
        ],
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
          durationMinutes: { type: 'integer' },
          passPercentage: { type: 'integer' },
          questionCount: { type: 'integer' },
          totalPoints: { type: 'integer' },
          topic: { $ref: '#/components/schemas/Topic' },
          bestPercentage: { type: ['number', 'null'] },
          attemptCount: { type: 'integer' },
          activeAttemptId: { type: ['string', 'null'] },
        },
      },
      AdminExamSummary: {
        allOf: [
          { $ref: '#/components/schemas/ExamSummary' },
          {
            type: 'object',
            required: ['status', 'updatedAt', 'attemptTotal'],
            properties: {
              status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
              updatedAt: { type: 'string', format: 'date-time' },
              attemptTotal: { type: 'integer' },
            },
          },
        ],
      },
      ExamDetail: {
        allOf: [
          { $ref: '#/components/schemas/ExamSummary' },
          {
            type: 'object',
            required: ['status', 'createdAt', 'topicBreakdown'],
            properties: {
              status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
              createdAt: { type: 'string', format: 'date-time' },
              topicBreakdown: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['topic', 'questionCount'],
                  properties: {
                    topic: { $ref: '#/components/schemas/Topic' },
                    questionCount: { type: 'integer' },
                  },
                },
              },
            },
          },
        ],
      },
      ExamInput: {
        type: 'object',
        required: ['title', 'description', 'topicId', 'difficulty', 'durationMinutes'],
        properties: {
          title: { type: 'string', minLength: 4, maxLength: 160 },
          description: { type: 'string', minLength: 10, maxLength: 2000 },
          topicId: { type: 'string' },
          difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
          durationMinutes: { type: 'integer', minimum: 1, maximum: 300 },
          passPercentage: { type: 'integer', minimum: 1, maximum: 100, default: 60 },
        },
      },
      QuestionOptionInput: {
        type: 'object',
        required: ['text', 'isCorrect'],
        properties: {
          id: { type: 'string' },
          text: { type: 'string', minLength: 1, maxLength: 500 },
          isCorrect: { type: 'boolean' },
        },
      },
      QuestionInput: {
        type: 'object',
        required: ['prompt', 'topicId', 'options'],
        description: 'Exactly one option must have isCorrect = true.',
        properties: {
          id: { type: 'string' },
          prompt: { type: 'string', minLength: 5, maxLength: 2000 },
          explanation: { type: 'string', maxLength: 2000 },
          topicId: { type: 'string' },
          points: { type: 'integer', minimum: 1, maximum: 10, default: 1 },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
            items: { $ref: '#/components/schemas/QuestionOptionInput' },
          },
        },
      },
      ExamQuestionsInput: {
        type: 'object',
        required: ['questions'],
        properties: {
          questions: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { $ref: '#/components/schemas/QuestionInput' },
          },
        },
      },
      AdminQuestion: {
        type: 'object',
        required: ['id', 'prompt', 'position', 'points', 'topic', 'options'],
        properties: {
          id: { type: 'string' },
          prompt: { type: 'string' },
          explanation: { type: ['string', 'null'] },
          position: { type: 'integer' },
          points: { type: 'integer' },
          topic: { $ref: '#/components/schemas/Topic' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'text', 'isCorrect', 'position'],
              properties: {
                id: { type: 'string' },
                text: { type: 'string' },
                isCorrect: { type: 'boolean' },
                position: { type: 'integer' },
              },
            },
          },
        },
      },
      ExamPublishCheck: {
        type: 'object',
        required: ['publishable', 'problems'],
        properties: {
          publishable: { type: 'boolean' },
          problems: { type: 'array', items: { type: 'string' } },
        },
      },
      StartAttemptInput: {
        type: 'object',
        required: ['examId'],
        properties: { examId: { type: 'string' } },
      },
      AnswerDraft: {
        type: 'object',
        required: ['questionId', 'optionId'],
        properties: {
          questionId: { type: 'string' },
          optionId: {
            type: ['string', 'null'],
            description: 'null clears a previous selection.',
          },
        },
      },
      SaveAnswersInput: {
        type: 'object',
        required: ['answers'],
        properties: {
          answers: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: { $ref: '#/components/schemas/AnswerDraft' },
          },
        },
      },
      SubmitAttemptInput: {
        type: 'object',
        properties: {
          answers: {
            type: 'array',
            maxItems: 200,
            items: { $ref: '#/components/schemas/AnswerDraft' },
            description: 'Optional final flush, applied in the same transaction as grading.',
          },
        },
      },
      SaveAnswersResult: {
        type: 'object',
        required: ['attemptId', 'saved', 'answeredCount', 'remainingSeconds', 'serverTime'],
        properties: {
          attemptId: { type: 'string' },
          saved: { type: 'integer' },
          answeredCount: { type: 'integer' },
          remainingSeconds: { type: 'integer' },
          serverTime: { type: 'string', format: 'date-time' },
        },
      },
      AttemptQuestion: {
        type: 'object',
        description: 'Deliberately carries no correctness flag and no explanation.',
        required: ['id', 'prompt', 'position', 'points', 'topic', 'options'],
        properties: {
          id: { type: 'string' },
          prompt: { type: 'string' },
          position: { type: 'integer' },
          points: { type: 'integer' },
          topic: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
          },
          options: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'text', 'position'],
              properties: {
                id: { type: 'string' },
                text: { type: 'string' },
                position: { type: 'integer' },
              },
            },
          },
        },
      },
      AttemptState: {
        type: 'object',
        required: [
          'attemptId',
          'status',
          'exam',
          'startedAt',
          'expiresAt',
          'remainingSeconds',
          'serverTime',
          'questions',
          'answers',
        ],
        properties: {
          attemptId: { type: 'string' },
          status: { type: 'string', enum: ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'] },
          exam: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              slug: { type: 'string' },
              title: { type: 'string' },
              durationMinutes: { type: 'integer' },
              passPercentage: { type: 'integer' },
            },
          },
          startedAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
          remainingSeconds: { type: 'integer' },
          serverTime: { type: 'string', format: 'date-time' },
          questions: {
            type: 'array',
            items: { $ref: '#/components/schemas/AttemptQuestion' },
          },
          answers: {
            type: 'object',
            additionalProperties: { type: ['string', 'null'] },
            description: 'questionId -> selected optionId (or null).',
          },
        },
      },
      AttemptResultSummary: {
        type: 'object',
        required: [
          'attemptId',
          'examId',
          'examTitle',
          'examSlug',
          'status',
          'startedAt',
          'durationMinutes',
          'timeSpentSeconds',
          'score',
          'maxScore',
          'percentage',
          'passed',
          'passPercentage',
          'correctCount',
          'incorrectCount',
          'unansweredCount',
          'questionCount',
        ],
        properties: {
          attemptId: { type: 'string' },
          examId: { type: 'string' },
          examTitle: { type: 'string' },
          examSlug: { type: 'string' },
          status: { type: 'string', enum: ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'] },
          startedAt: { type: 'string', format: 'date-time' },
          submittedAt: { type: ['string', 'null'], format: 'date-time' },
          durationMinutes: { type: 'integer' },
          timeSpentSeconds: { type: 'integer' },
          score: { type: 'integer' },
          maxScore: { type: 'integer' },
          percentage: { type: 'number' },
          passed: { type: 'boolean' },
          passPercentage: { type: 'integer' },
          correctCount: { type: 'integer' },
          incorrectCount: { type: 'integer' },
          unansweredCount: { type: 'integer' },
          questionCount: { type: 'integer' },
        },
      },
      TopicScore: {
        type: 'object',
        required: ['topic', 'correct', 'total', 'percentage'],
        properties: {
          topic: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
          },
          correct: { type: 'integer' },
          total: { type: 'integer' },
          percentage: { type: 'number' },
        },
      },
      AttemptReviewQuestion: {
        type: 'object',
        required: ['id', 'prompt', 'position', 'points', 'topic', 'correctOptionId', 'isCorrect', 'options'],
        properties: {
          id: { type: 'string' },
          prompt: { type: 'string' },
          position: { type: 'integer' },
          points: { type: 'integer' },
          topic: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
          },
          explanation: { type: ['string', 'null'] },
          selectedOptionId: { type: ['string', 'null'] },
          correctOptionId: { type: 'string' },
          isCorrect: { type: 'boolean' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'text', 'position', 'isCorrect'],
              properties: {
                id: { type: 'string' },
                text: { type: 'string' },
                position: { type: 'integer' },
                isCorrect: { type: 'boolean' },
              },
            },
          },
        },
      },
      AttemptResultDetail: {
        allOf: [
          { $ref: '#/components/schemas/AttemptResultSummary' },
          {
            type: 'object',
            required: ['topicScores', 'questions', 'history'],
            properties: {
              topicScores: {
                type: 'array',
                items: { $ref: '#/components/schemas/TopicScore' },
              },
              questions: {
                type: 'array',
                items: { $ref: '#/components/schemas/AttemptReviewQuestion' },
              },
              history: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    attemptId: { type: 'string' },
                    submittedAt: { type: ['string', 'null'] },
                    percentage: { type: 'number' },
                  },
                },
              },
            },
          },
        ],
      },
      PaginatedExamSummary: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/ExamSummary' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      PaginatedAdminExamSummary: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/AdminExamSummary' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      PaginatedAttemptResult: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/AttemptResultSummary' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      AdminStats: {
        type: 'object',
        required: [
          'totalUsers',
          'totalStudents',
          'totalExams',
          'publishedExams',
          'draftExams',
          'archivedExams',
          'totalQuestions',
          'totalAttempts',
          'completedAttempts',
          'inProgressAttempts',
          'averagePercentage',
          'examPerformance',
        ],
        properties: {
          totalUsers: { type: 'integer' },
          totalStudents: { type: 'integer' },
          totalExams: { type: 'integer' },
          publishedExams: { type: 'integer' },
          draftExams: { type: 'integer' },
          archivedExams: { type: 'integer' },
          totalQuestions: { type: 'integer' },
          totalAttempts: { type: 'integer' },
          completedAttempts: { type: 'integer' },
          inProgressAttempts: { type: 'integer' },
          averagePercentage: { type: 'number' },
          examPerformance: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                examId: { type: 'string' },
                title: { type: 'string' },
                attempts: { type: 'integer' },
                averagePercentage: { type: 'number' },
                passRate: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
  security: [{ sessionCookie: [] }],
} as const;
