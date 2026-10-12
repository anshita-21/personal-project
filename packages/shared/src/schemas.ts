import { z } from 'zod';
import { DIFFICULTIES, ROLES } from './enums';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/** All database ids are cuids. Validate shape, not just "non-empty string". */
export const idSchema = z.string().min(1).max(64);

/**
 * Password policy, declared once and reused by the API validator and the
 * Angular registration form, so the two can never disagree.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_RULES_HINT =
  'At least 10 characters, including one letter and one number.';

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(200, 'Password must be at most 200 characters.')
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/[0-9]/, 'Password must contain a number.');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(255)
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.'));

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately NOT `passwordSchema`: a tightened policy must never lock out
  // an existing account, and login must not leak the policy to an attacker.
  password: z.string().min(1, 'Password is required.').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.').max(200),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/* -------------------------------------------------------------------------- */
/* Exam catalogue queries                                                      */
/* -------------------------------------------------------------------------- */

export const EXAM_SORT_FIELDS = ['title', 'createdAt', 'durationMinutes', 'difficulty'] as const;
export type ExamSortField = (typeof EXAM_SORT_FIELDS)[number];

export const PAGE_SIZE_DEFAULT = 9;
export const PAGE_SIZE_MAX = 50;

/**
 * Catalogue query contract. Every field is validated and clamped server-side —
 * the API never trusts a client-supplied page size or sort column (an
 * unvalidated sort column is an injection surface and an unbounded page size is
 * a denial-of-service surface).
 */
export const examQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  search: z.string().trim().max(120).optional(),
  topicId: idSchema.optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  sort: z.enum(EXAM_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ExamQuery = z.infer<typeof examQuerySchema>;

/** Admin catalogue additionally filters by publication status. */
export const adminExamQuerySchema = examQuerySchema.extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});
export type AdminExamQuery = z.infer<typeof adminExamQuerySchema>;

export const attemptHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(10),
  examId: idSchema.optional(),
});
export type AttemptHistoryQuery = z.infer<typeof attemptHistoryQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Attempts                                                                    */
/* -------------------------------------------------------------------------- */

export const startAttemptSchema = z.object({
  examId: idSchema,
});
export type StartAttemptInput = z.infer<typeof startAttemptSchema>;

/** A single autosaved answer. `optionId: null` clears a previous selection. */
export const answerDraftSchema = z.object({
  questionId: idSchema,
  optionId: idSchema.nullable(),
});
export type AnswerDraft = z.infer<typeof answerDraftSchema>;

/**
 * Autosave is a batch upsert so the client can retry a failed flush without
 * replaying a queue of single writes (and so one round trip covers a burst of
 * fast clicks).
 */
export const saveAnswersSchema = z.object({
  answers: z.array(answerDraftSchema).min(1).max(200),
});
export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>;

export const submitAttemptSchema = z.object({
  /** Optional final flush, applied inside the same transaction as grading. */
  answers: z.array(answerDraftSchema).max(200).optional(),
});
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;

/* -------------------------------------------------------------------------- */
/* Admin authoring                                                             */
/* -------------------------------------------------------------------------- */

export const topicInputSchema = z.object({
  name: z.string().trim().min(2, 'Topic name must be at least 2 characters.').max(60),
  description: z.string().trim().max(400).optional(),
});
export type TopicInput = z.infer<typeof topicInputSchema>;

export const optionInputSchema = z.object({
  id: idSchema.optional(),
  text: z.string().trim().min(1, 'Option text is required.').max(500),
  isCorrect: z.boolean(),
});
export type OptionInput = z.infer<typeof optionInputSchema>;

export const questionInputSchema = z.object({
  id: idSchema.optional(),
  prompt: z.string().trim().min(5, 'Question prompt must be at least 5 characters.').max(2000),
  explanation: z.string().trim().max(2000).optional(),
  topicId: idSchema,
  points: z.coerce.number().int().min(1).max(10).default(1),
  options: z
    .array(optionInputSchema)
    .min(2, 'A question needs at least 2 options.')
    .max(6, 'A question can have at most 6 options.')
    // Single-correct multiple choice: grading assumes exactly one correct
    // option, so the invariant is enforced at the edge rather than assumed.
    .refine(
      (options) => options.filter((option) => option.isCorrect).length === 1,
      'Exactly one option must be marked correct.',
    ),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const examInputSchema = z.object({
  title: z.string().trim().min(4, 'Title must be at least 4 characters.').max(160),
  description: z.string().trim().min(10, 'Description must be at least 10 characters.').max(2000),
  topicId: idSchema,
  difficulty: z.enum(DIFFICULTIES),
  durationMinutes: z.coerce.number().int().min(1).max(300),
  passPercentage: z.coerce.number().int().min(1).max(100).default(60),
});
export type ExamInput = z.infer<typeof examInputSchema>;

/** Replaces the full question set of an exam in one transaction. */
export const examQuestionsInputSchema = z.object({
  questions: z.array(questionInputSchema).min(1).max(100),
});
export type ExamQuestionsInput = z.infer<typeof examQuestionsInputSchema>;

export const adminUserRoleSchema = z.object({
  role: z.enum(ROLES),
});
export type AdminUserRoleInput = z.infer<typeof adminUserRoleSchema>;
