import type { Attempt, Prisma } from '@prisma/client';
import type {
  AnswerDraft,
  AttemptHistoryQuery,
  AttemptStatus,
  AttemptQuestionView,
  AttemptResultDetail,
  AttemptResultSummary,
  AttemptReviewQuestion,
  AttemptStateView,
  Paginated,
  SaveAnswersResult,
} from '@examprep/shared';
import { prisma, type PrismaTransaction } from '../../db/prisma';
import {
  AppError,
  attemptAlreadyFinished,
  attemptExpired,
  examNotPublished,
  notFound,
  validationError,
} from '../../errors/app-error';
import { logger } from '../../logger';
import {
  deadlineFor,
  isPastDeadline,
  remainingSeconds,
  timeSpentSeconds,
} from './attempt-clock';
import { gradeAttempt, toPercentage, type GradableQuestion } from './grading';

type Db = PrismaTransaction | typeof prisma;

/* -------------------------------------------------------------------------- */
/* Loading helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Object-level access control.
 *
 * A missing attempt and someone else's attempt are both reported as 404. A 403
 * here would confirm that an id exists, which hands an attacker a way to probe
 * for valid ids; the learner has no legitimate reason to tell the two apart.
 */
async function loadOwnAttempt(db: Db, attemptId: string, userId: string) {
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: { select: { id: true, slug: true, title: true } },
    },
  });
  if (!attempt || attempt.userId !== userId) {
    throw notFound('Attempt not found.');
  }
  return attempt;
}

async function loadGradableQuestions(db: Db, examId: string): Promise<GradableQuestion[]> {
  const rows = await db.question.findMany({
    where: { examId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      points: true,
      topicId: true,
      topic: { select: { name: true } },
      options: { where: { isCorrect: true }, select: { id: true } },
    },
  });

  return rows.map((row) => {
    const correct = row.options[0];
    if (!correct || row.options.length !== 1) {
      // Unreachable for a published exam: `publishChecks` refuses to publish an
      // exam whose questions do not have exactly one correct option. Failing
      // loudly beats silently grading everyone as wrong.
      throw new AppError(
        500,
        'INTERNAL_ERROR',
        `Question ${row.id} does not have exactly one correct option.`,
      );
    }
    return {
      id: row.id,
      points: row.points,
      correctOptionId: correct.id,
      topicId: row.topicId,
      topicName: row.topic.name,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Starting an attempt                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Starts - or resumes - an attempt.
 *
 * Idempotent by design: a double-click, a retried request after a dropped
 * response, or a second browser tab must not create a second live attempt. The
 * partial unique index `Attempt_one_active_per_user_exam` is the backstop for
 * the case where two requests race past the pre-check simultaneously.
 */
export async function startAttempt(userId: string, examId: string): Promise<AttemptStateView> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      status: true,
      durationMinutes: true,
      passPercentage: true,
      _count: { select: { questions: true } },
      questions: { select: { points: true } },
    },
  });

  if (!exam) {
    throw notFound('Exam not found.');
  }
  if (exam.status !== 'PUBLISHED') {
    throw examNotPublished('This exam is not open for attempts.');
  }
  if (exam._count.questions === 0) {
    throw examNotPublished('This exam has no questions yet.');
  }

  const existing = await prisma.attempt.findFirst({
    where: { userId, examId, status: 'IN_PROGRESS' },
  });

  if (existing) {
    if (isPastDeadline(existing)) {
      // The learner abandoned a previous attempt and its clock ran out. Close
      // it (graded on whatever was autosaved) before letting them start again.
      await finalizeAttempt(existing.id, userId, { reason: 'EXPIRED' });
    } else {
      return getAttemptState(userId, existing.id);
    }
  }

  const maxScore = exam.questions.reduce((sum, question) => sum + question.points, 0);
  const startedAt = new Date();

  try {
    const attempt = await prisma.attempt.create({
      data: {
        userId,
        examId,
        startedAt,
        expiresAt: deadlineFor(startedAt, exam.durationMinutes),
        durationMinutes: exam.durationMinutes,
        passPercentage: exam.passPercentage,
        questionCount: exam._count.questions,
        maxScore,
      },
      select: { id: true },
    });
    return getAttemptState(userId, attempt.id);
  } catch (error) {
    // P2002 on the partial unique index = a concurrent request won the race.
    // Return the attempt that won instead of surfacing a conflict.
    if (isUniqueViolation(error)) {
      const winner = await prisma.attempt.findFirst({
        where: { userId, examId, status: 'IN_PROGRESS' },
        select: { id: true },
      });
      if (winner) {
        logger.info({ userId, examId }, 'concurrent attempt start resolved to existing attempt');
        return getAttemptState(userId, winner.id);
      }
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

/* -------------------------------------------------------------------------- */
/* Reading attempt state (the exam runner)                                     */
/* -------------------------------------------------------------------------- */

/**
 * The payload the exam runner renders.
 *
 * Note the shape of the questions: `AttemptQuestionView` has no `isCorrect` and
 * no `explanation`, so this endpoint structurally cannot leak the answer key
 * before submission.
 */
export async function getAttemptState(
  userId: string,
  attemptId: string,
): Promise<AttemptStateView> {
  const attempt = await loadOwnAttempt(prisma, attemptId, userId);

  if (attempt.status !== 'IN_PROGRESS') {
    throw attemptAlreadyFinished(
      attempt.status === 'EXPIRED'
        ? 'Time ran out for this attempt.'
        : 'This attempt has already been submitted.',
    );
  }

  if (isPastDeadline(attempt)) {
    // Reading an overdue attempt closes it. Without this, an abandoned attempt
    // would sit IN_PROGRESS forever and the learner could resume it later.
    await finalizeAttempt(attempt.id, userId, { reason: 'EXPIRED' });
    throw attemptExpired('Time ran out for this attempt.');
  }

  const [exam, questions, answers] = await Promise.all([
    prisma.exam.findUniqueOrThrow({
      where: { id: attempt.examId },
      select: { id: true, slug: true, title: true, durationMinutes: true, passPercentage: true },
    }),
    prisma.question.findMany({
      where: { examId: attempt.examId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        prompt: true,
        position: true,
        points: true,
        topic: { select: { id: true, name: true } },
        options: {
          orderBy: { position: 'asc' },
          select: { id: true, text: true, position: true },
        },
      },
    }),
    prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.id },
      select: { questionId: true, selectedOptionId: true },
    }),
  ]);

  const now = new Date();
  const questionViews: AttemptQuestionView[] = questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    position: question.position,
    points: question.points,
    topic: question.topic,
    options: question.options,
  }));

  const answerMap: Record<string, string | null> = {};
  for (const answer of answers) {
    answerMap[answer.questionId] = answer.selectedOptionId;
  }

  return {
    attemptId: attempt.id,
    status: attempt.status,
    exam: {
      id: exam.id,
      slug: exam.slug,
      title: exam.title,
      durationMinutes: attempt.durationMinutes,
      passPercentage: attempt.passPercentage,
    },
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    remainingSeconds: remainingSeconds(attempt, now),
    serverTime: now.toISOString(),
    questions: questionViews,
    answers: answerMap,
  };
}

/* -------------------------------------------------------------------------- */
/* Autosave                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Validates that every (questionId, optionId) pair actually belongs to this
 * exam. Skipping this check would let a learner store an option id from a
 * different exam - which the grader would then compare against the wrong key.
 */
async function assertAnswersBelongToExam(
  db: Db,
  examId: string,
  answers: AnswerDraft[],
): Promise<void> {
  const questionIds = [...new Set(answers.map((answer) => answer.questionId))];
  const questions = await db.question.findMany({
    where: { id: { in: questionIds }, examId },
    select: { id: true, options: { select: { id: true } } },
  });

  const optionsByQuestion = new Map(
    questions.map((question) => [question.id, new Set(question.options.map((o) => o.id))] as const),
  );

  for (const [index, answer] of answers.entries()) {
    const options = optionsByQuestion.get(answer.questionId);
    if (!options) {
      throw validationError('Answer refers to a question that is not part of this exam.', [
        { path: `answers.${index}.questionId`, message: 'Unknown question for this exam.' },
      ]);
    }
    if (answer.optionId !== null && !options.has(answer.optionId)) {
      throw validationError('Answer refers to an option that is not part of this question.', [
        { path: `answers.${index}.optionId`, message: 'Unknown option for this question.' },
      ]);
    }
  }
}

async function persistAnswers(
  tx: PrismaTransaction,
  attemptId: string,
  answers: AnswerDraft[],
): Promise<void> {
  // One upsert per answer, inside a single transaction. The unique index on
  // (attemptId, questionId) is what makes the upsert - and therefore a retried
  // autosave - idempotent: a replayed flush overwrites, never duplicates.
  for (const answer of answers) {
    await tx.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId: answer.questionId } },
      create: {
        attemptId,
        questionId: answer.questionId,
        selectedOptionId: answer.optionId,
      },
      update: { selectedOptionId: answer.optionId },
    });
  }
}

export async function saveAnswers(
  userId: string,
  attemptId: string,
  answers: AnswerDraft[],
): Promise<SaveAnswersResult> {
  const attempt = await loadOwnAttempt(prisma, attemptId, userId);

  if (attempt.status !== 'IN_PROGRESS') {
    throw attemptAlreadyFinished('This attempt is already closed, so answers cannot change.');
  }
  if (isPastDeadline(attempt)) {
    await finalizeAttempt(attempt.id, userId, { reason: 'EXPIRED' });
    throw attemptExpired('Time ran out, so this answer was not saved.');
  }

  await assertAnswersBelongToExam(prisma, attempt.examId, answers);

  const answeredCount = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: the deadline may have passed between the
    // check above and this write, and a submit may have landed concurrently.
    const current = await tx.attempt.findUnique({
      where: { id: attemptId },
      select: { status: true, expiresAt: true, startedAt: true },
    });
    if (!current || current.status !== 'IN_PROGRESS') {
      throw attemptAlreadyFinished('This attempt is already closed, so answers cannot change.');
    }
    if (isPastDeadline(current)) {
      throw attemptExpired('Time ran out, so this answer was not saved.');
    }

    await persistAnswers(tx, attemptId, answers);

    return tx.attemptAnswer.count({
      where: { attemptId, selectedOptionId: { not: null } },
    });
  });

  const now = new Date();
  return {
    attemptId,
    saved: answers.length,
    answeredCount,
    remainingSeconds: remainingSeconds(attempt, now),
    serverTime: now.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Submission and grading                                                      */
/* -------------------------------------------------------------------------- */

interface FinalizeOptions {
  reason: 'SUBMITTED' | 'EXPIRED';
  /** Final answer flush, accepted only for a genuine in-time submission. */
  finalAnswers?: AnswerDraft[];
}

/**
 * Closes and grades an attempt. The single write path to a terminal status.
 *
 * Idempotency: the status transition is a conditional UPDATE
 * (`WHERE id = ? AND status = 'IN_PROGRESS'`). The first caller to commit wins;
 * every later caller sees 0 rows affected and is handed the already-stored
 * result instead of grading a second time. That is what makes a double-click on
 * "Submit", or a retried request whose response was lost, safe.
 */
export async function finalizeAttempt(
  attemptId: string,
  userId: string,
  options: FinalizeOptions,
): Promise<AttemptResultSummary> {
  const preloaded = await loadOwnAttempt(prisma, attemptId, userId);
  if (preloaded.status !== 'IN_PROGRESS') {
    return buildResultSummary(preloaded, preloaded.exam);
  }

  // Validate the final flush before opening the transaction: a validation
  // failure must abort the submission, not leave a half-applied flush.
  const expired = options.reason === 'EXPIRED' || isPastDeadline(preloaded);
  const finalAnswers = expired ? [] : (options.finalAnswers ?? []);
  if (finalAnswers.length > 0) {
    await assertAnswersBelongToExam(prisma, preloaded.examId, finalAnswers);
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.attempt.findUnique({ where: { id: attemptId } });
    if (!current) {
      throw notFound('Attempt not found.');
    }
    if (current.status !== 'IN_PROGRESS') {
      return null;
    }

    // Re-derive expiry from the row inside the transaction: this is the value
    // grading is allowed to trust.
    const pastDeadline = isPastDeadline(current);
    const terminalStatus: AttemptStatus =
      pastDeadline || options.reason === 'EXPIRED' ? 'EXPIRED' : 'SUBMITTED';

    // Answers that arrive after the deadline are discarded rather than graded.
    // Accepting them would let a learner keep answering past time-up simply by
    // batching everything into the submit call.
    if (terminalStatus === 'SUBMITTED' && finalAnswers.length > 0) {
      await persistAnswers(tx, attemptId, finalAnswers);
    }

    const [questions, storedAnswers] = await Promise.all([
      loadGradableQuestions(tx, current.examId),
      tx.attemptAnswer.findMany({
        where: { attemptId },
        select: { questionId: true, selectedOptionId: true },
      }),
    ]);

    const graded = gradeAttempt(
      questions,
      storedAnswers.map((answer) => ({
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
      })),
      current.passPercentage,
    );

    const submittedAt = new Date();
    const claimed = await tx.attempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: {
        status: terminalStatus,
        submittedAt,
        score: graded.score,
        maxScore: graded.maxScore,
        percentage: graded.percentage,
        correctCount: graded.correctCount,
        incorrectCount: graded.incorrectCount,
        unansweredCount: graded.unansweredCount,
        questionCount: graded.questionCount,
      },
    });

    if (claimed.count === 0) {
      // Another transaction committed the submission first.
      return null;
    }

    // Stamp the per-answer verdicts so the review screen does not have to
    // re-grade, and so the answer key used at grading time is preserved even if
    // an admin later edits the exam.
    for (const answer of graded.answers) {
      await tx.attemptAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: answer.questionId } },
        create: {
          attemptId,
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId,
          isCorrect: answer.isCorrect,
          awardedPoints: answer.awardedPoints,
        },
        update: { isCorrect: answer.isCorrect, awardedPoints: answer.awardedPoints },
      });
    }

    return { ...current, status: terminalStatus, submittedAt, ...graded };
  });

  if (!result) {
    const settled = await loadOwnAttempt(prisma, attemptId, userId);
    return buildResultSummary(settled, settled.exam);
  }

  return buildResultSummary(
    {
      ...preloaded,
      status: result.status,
      submittedAt: result.submittedAt,
      score: result.score,
      maxScore: result.maxScore,
      percentage: result.percentage,
      correctCount: result.correctCount,
      incorrectCount: result.incorrectCount,
      unansweredCount: result.unansweredCount,
      questionCount: result.questionCount,
    },
    preloaded.exam,
  );
}

export async function submitAttempt(
  userId: string,
  attemptId: string,
  finalAnswers?: AnswerDraft[],
): Promise<AttemptResultSummary> {
  return finalizeAttempt(attemptId, userId, {
    reason: 'SUBMITTED',
    ...(finalAnswers ? { finalAnswers } : {}),
  });
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

type ExamRef = { id: string; slug: string; title: string };

function buildResultSummary(attempt: Attempt, exam: ExamRef): AttemptResultSummary {
  return {
    attemptId: attempt.id,
    examId: exam.id,
    examTitle: exam.title,
    examSlug: exam.slug,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    durationMinutes: attempt.durationMinutes,
    timeSpentSeconds: timeSpentSeconds(attempt, attempt.submittedAt),
    score: attempt.score ?? 0,
    maxScore: attempt.maxScore,
    percentage: attempt.percentage ?? 0,
    passed: (attempt.percentage ?? 0) >= attempt.passPercentage,
    passPercentage: attempt.passPercentage,
    correctCount: attempt.correctCount ?? 0,
    incorrectCount: attempt.incorrectCount ?? 0,
    unansweredCount: attempt.unansweredCount ?? 0,
    questionCount: attempt.questionCount,
  };
}

/**
 * The full review payload, including the answer key and explanations.
 *
 * Guarded twice: the attempt must belong to the caller, and it must be in a
 * terminal state. An in-progress attempt returns 409 rather than the key.
 */
export async function getAttemptResult(
  userId: string,
  attemptId: string,
): Promise<AttemptResultDetail> {
  const attempt = await loadOwnAttempt(prisma, attemptId, userId);

  if (attempt.status === 'IN_PROGRESS') {
    if (isPastDeadline(attempt)) {
      await finalizeAttempt(attempt.id, userId, { reason: 'EXPIRED' });
      return getAttemptResult(userId, attemptId);
    }
    throw new AppError(
      409,
      'CONFLICT',
      'This attempt is still in progress. Submit it to see results.',
    );
  }

  const [questions, answers, history] = await Promise.all([
    prisma.question.findMany({
      where: { examId: attempt.examId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        prompt: true,
        position: true,
        points: true,
        explanation: true,
        topic: { select: { id: true, name: true } },
        options: {
          orderBy: { position: 'asc' },
          select: { id: true, text: true, position: true, isCorrect: true },
        },
      },
    }),
    prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: { questionId: true, selectedOptionId: true, isCorrect: true },
    }),
    prisma.attempt.findMany({
      where: { userId, examId: attempt.examId, status: { not: 'IN_PROGRESS' } },
      orderBy: { submittedAt: 'asc' },
      select: { id: true, submittedAt: true, percentage: true },
    }),
  ]);

  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer] as const));

  const reviewQuestions: AttemptReviewQuestion[] = questions.map((question) => {
    const stored = answerByQuestion.get(question.id);
    const correctOption = question.options.find((option) => option.isCorrect);
    return {
      id: question.id,
      prompt: question.prompt,
      position: question.position,
      points: question.points,
      topic: question.topic,
      explanation: question.explanation,
      selectedOptionId: stored?.selectedOptionId ?? null,
      correctOptionId: correctOption?.id ?? '',
      isCorrect: stored?.isCorrect ?? false,
      options: question.options,
    };
  });

  const topicBuckets = new Map<string, { name: string; correct: number; total: number }>();
  for (const question of reviewQuestions) {
    const bucket =
      topicBuckets.get(question.topic.id) ??
      (() => {
        const created = { name: question.topic.name, correct: 0, total: 0 };
        topicBuckets.set(question.topic.id, created);
        return created;
      })();
    bucket.total += 1;
    if (question.isCorrect) {
      bucket.correct += 1;
    }
  }

  return {
    ...buildResultSummary(attempt, attempt.exam),
    topicScores: [...topicBuckets.entries()]
      .map(([topicId, bucket]) => ({
        topic: { id: topicId, name: bucket.name },
        correct: bucket.correct,
        total: bucket.total,
        percentage: toPercentage(bucket.correct, bucket.total),
      }))
      .sort((a, b) => a.topic.name.localeCompare(b.topic.name)),
    questions: reviewQuestions,
    history: history.map((row) => ({
      attemptId: row.id,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      percentage: row.percentage ?? 0,
    })),
  };
}

export async function listAttempts(
  userId: string,
  query: AttemptHistoryQuery,
): Promise<Paginated<AttemptResultSummary>> {
  await expireDueAttempts(userId);

  const where: Prisma.AttemptWhereInput = {
    userId,
    ...(query.examId ? { examId: query.examId } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      include: { exam: { select: { id: true, slug: true, title: true } } },
      orderBy: { startedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: rows.map((row) => buildResultSummary(row, row.exam)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/* -------------------------------------------------------------------------- */
/* Expiry sweep                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Closes attempts whose deadline has passed.
 *
 * Expiry is applied lazily - on the learner's next read of their dashboard or
 * history - rather than by a background scheduler. That keeps the deployment to
 * a single process with no scheduler to operate, at the cost of an attempt
 * staying nominally IN_PROGRESS until someone looks. Every path that could act
 * on a stale attempt (resume, autosave, submit, results) re-checks the deadline
 * itself, so the lazy sweep is a tidiness measure, not a correctness one.
 *
 * A cron/Lambda deployment would call exactly this function - see
 * docs/deployment.md.
 */
export async function expireDueAttempts(userId?: string): Promise<number> {
  const due = await prisma.attempt.findMany({
    where: {
      status: 'IN_PROGRESS',
      expiresAt: { lte: new Date() },
      ...(userId ? { userId } : {}),
    },
    select: { id: true, userId: true },
    take: 100,
  });

  let closed = 0;
  for (const attempt of due) {
    try {
      await finalizeAttempt(attempt.id, attempt.userId, { reason: 'EXPIRED' });
      closed += 1;
    } catch (error) {
      // One bad attempt must not abort the sweep for the rest.
      logger.warn({ err: error, attemptId: attempt.id }, 'failed to expire attempt');
    }
  }
  return closed;
}
