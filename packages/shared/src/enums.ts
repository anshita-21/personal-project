/**
 * Domain enumerations.
 *
 * These are declared as plain const objects (not TypeScript `enum`s) so the
 * values are usable at runtime in both the API and the browser bundle without
 * pulling in Prisma's generated client on the frontend.
 */

export const ROLES = ['STUDENT', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const EXAM_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

/**
 * Attempt lifecycle.
 *
 *   IN_PROGRESS --(learner submits)--> SUBMITTED
 *   IN_PROGRESS --(deadline passes)--> EXPIRED  (graded with whatever was saved)
 *
 * SUBMITTED and EXPIRED are terminal: both are graded and immutable.
 */
export const ATTEMPT_STATUSES = ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const TERMINAL_ATTEMPT_STATUSES: readonly AttemptStatus[] = ['SUBMITTED', 'EXPIRED'];

export function isTerminalAttemptStatus(status: AttemptStatus): boolean {
  return TERMINAL_ATTEMPT_STATUSES.includes(status);
}
