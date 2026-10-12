import type {
  AdminStats,
  ExamDetail,
  ExamInput,
  ExamPublishCheck,
  ExamQuestionsInput,
  TopicInput,
  TopicView,
} from '@examprep/shared';
import { prisma } from '../../db/prisma';
import { conflict, examNotPublishable, notFound, validationError } from '../../errors/app-error';
import { getExamDetailForAdmin } from '../exams/exam.service';
import { toTopicView } from '../exams/exam.mapper';
import { toPercentage } from '../attempts/grading';
import { slugify, uniqueExamSlug } from './slug';

/* -------------------------------------------------------------------------- */
/* Topics                                                                     */
/* -------------------------------------------------------------------------- */

export async function createTopic(input: TopicInput): Promise<TopicView> {
  const slug = slugify(input.name);
  const existing = await prisma.topic.findFirst({
    where: { OR: [{ name: input.name }, { slug }] },
    select: { id: true },
  });
  if (existing) {
    throw conflict('A topic with that name already exists.');
  }
  const topic = await prisma.topic.create({
    data: { name: input.name, slug, description: input.description ?? null },
  });
  return toTopicView(topic);
}

/* -------------------------------------------------------------------------- */
/* Exams                                                                      */
/* -------------------------------------------------------------------------- */

async function assertTopicExists(topicId: string): Promise<void> {
  const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!topic) {
    throw validationError('Unknown topic.', [{ path: 'topicId', message: 'Unknown topic.' }]);
  }
}

export async function createExam(input: ExamInput, createdById: string): Promise<ExamDetail> {
  await assertTopicExists(input.topicId);
  const exam = await prisma.exam.create({
    data: {
      title: input.title,
      slug: await uniqueExamSlug(input.title),
      description: input.description,
      topicId: input.topicId,
      difficulty: input.difficulty,
      durationMinutes: input.durationMinutes,
      passPercentage: input.passPercentage,
      status: 'DRAFT',
      createdById,
    },
    select: { id: true },
  });
  return getExamDetailForAdmin(exam.id);
}

export async function updateExam(examId: string, input: ExamInput): Promise<ExamDetail> {
  await assertTopicExists(input.topicId);
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, status: true },
  });
  if (!exam) {
    throw notFound('Exam not found.');
  }

  await prisma.exam.update({
    where: { id: examId },
    data: {
      title: input.title,
      description: input.description,
      topicId: input.topicId,
      difficulty: input.difficulty,
      durationMinutes: input.durationMinutes,
      passPercentage: input.passPercentage,
      // The slug is only re-derived while the exam is still a draft: a
      // published exam's URL has been shared, and past results link to it.
      ...(exam.status === 'DRAFT' && exam.title !== input.title
        ? { slug: await uniqueExamSlug(input.title, prisma, examId) }
        : {}),
    },
  });

  return getExamDetailForAdmin(examId);
}

/**
 * Replaces an exam's entire question set in one transaction.
 *
 * Replace-all (rather than a per-question diff) is deliberate: the editor edits
 * the paper as a whole, question order matters, and a partial failure that left
 * half the old questions and half the new ones would be worse than a rejected
 * save. The unique (examId, position) index means the delete must precede the
 * insert, which a transaction guarantees.
 */
export async function replaceExamQuestions(
  examId: string,
  input: ExamQuestionsInput,
): Promise<ExamDetail> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, _count: { select: { attempts: true } } },
  });
  if (!exam) {
    throw notFound('Exam not found.');
  }

  const topicIds = [...new Set(input.questions.map((question) => question.topicId))];
  const topics = await prisma.topic.findMany({
    where: { id: { in: topicIds } },
    select: { id: true },
  });
  if (topics.length !== topicIds.length) {
    throw validationError('One or more questions reference an unknown topic.', [
      { path: 'questions', message: 'Unknown topic.' },
    ]);
  }

  await prisma.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { examId } });
    for (const [index, question] of input.questions.entries()) {
      await tx.question.create({
        data: {
          examId,
          topicId: question.topicId,
          prompt: question.prompt,
          explanation: question.explanation ?? null,
          points: question.points,
          position: index + 1,
          options: {
            create: question.options.map((option, optionIndex) => ({
              text: option.text,
              isCorrect: option.isCorrect,
              position: optionIndex + 1,
            })),
          },
        },
      });
    }
  });

  return getExamDetailForAdmin(examId);
}

/**
 * Everything that must be true before an exam may be published.
 *
 * Returned as a list of human-readable problems rather than a single boolean so
 * the admin editor can show exactly what is missing, and so the same check can
 * back both the "can I publish?" indicator and the publish endpoint itself.
 */
export async function publishChecks(examId: string): Promise<ExamPublishCheck> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      title: true,
      description: true,
      durationMinutes: true,
      passPercentage: true,
      questions: {
        select: {
          id: true,
          prompt: true,
          position: true,
          points: true,
          options: { select: { id: true, isCorrect: true, text: true } },
        },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!exam) {
    throw notFound('Exam not found.');
  }

  const problems: string[] = [];

  if (exam.questions.length === 0) {
    problems.push('Add at least one question.');
  }
  if (exam.description.trim().length < 10) {
    problems.push('Add a description of at least 10 characters.');
  }
  if (exam.durationMinutes < 1) {
    problems.push('Set a duration of at least 1 minute.');
  }

  for (const question of exam.questions) {
    const label = `Question ${question.position}`;
    if (question.options.length < 2) {
      problems.push(`${label}: needs at least 2 answer options.`);
    }
    const correct = question.options.filter((option) => option.isCorrect).length;
    if (correct !== 1) {
      problems.push(`${label}: must have exactly one correct option (found ${correct}).`);
    }
    if (question.options.some((option) => option.text.trim().length === 0)) {
      problems.push(`${label}: every option needs text.`);
    }
    if (question.prompt.trim().length < 5) {
      problems.push(`${label}: the prompt is too short.`);
    }
  }

  return { publishable: problems.length === 0, problems };
}

export async function publishExam(examId: string): Promise<ExamDetail> {
  const check = await publishChecks(examId);
  if (!check.publishable) {
    throw examNotPublishable(
      'This exam is not ready to publish.',
      check.problems.map((message) => ({ path: 'exam', message })),
    );
  }
  await prisma.exam.update({
    where: { id: examId },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });
  return getExamDetailForAdmin(examId);
}

export async function setExamStatus(
  examId: string,
  status: 'DRAFT' | 'ARCHIVED',
): Promise<ExamDetail> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
  if (!exam) {
    throw notFound('Exam not found.');
  }
  await prisma.exam.update({ where: { id: examId }, data: { status } });
  return getExamDetailForAdmin(examId);
}

/**
 * Hard delete, allowed only while no learner has ever attempted the exam.
 * Once attempts exist, deleting would destroy their results; archiving is the
 * supported way to retire such an exam.
 */
export async function deleteExam(examId: string): Promise<void> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, _count: { select: { attempts: true } } },
  });
  if (!exam) {
    throw notFound('Exam not found.');
  }
  if (exam._count.attempts > 0) {
    throw conflict(
      'This exam has learner attempts and cannot be deleted. Archive it instead.',
    );
  }
  await prisma.exam.delete({ where: { id: examId } });
}

/* -------------------------------------------------------------------------- */
/* Platform statistics                                                        */
/* -------------------------------------------------------------------------- */

export async function getAdminStats(): Promise<AdminStats> {
  const [
    totalUsers,
    totalStudents,
    examCounts,
    totalQuestions,
    attemptCounts,
    gradedAggregate,
    perExam,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.exam.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.question.count(),
    prisma.attempt.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.attempt.aggregate({
      where: { status: { not: 'IN_PROGRESS' } },
      _avg: { percentage: true },
    }),
    prisma.attempt.groupBy({
      by: ['examId'],
      where: { status: { not: 'IN_PROGRESS' } },
      _count: { _all: true },
      _avg: { percentage: true },
    }),
  ]);

  const examStatusCount = (status: string): number =>
    examCounts.find((row) => row.status === status)?._count._all ?? 0;
  const attemptStatusCount = (status: string): number =>
    attemptCounts.find((row) => row.status === status)?._count._all ?? 0;

  // Pass rate needs the per-exam pass mark, so it is counted from rows rather
  // than derived from the average percentage.
  const examIds = perExam.map((row) => row.examId);
  const [exams, passCounts] = await Promise.all([
    prisma.exam.findMany({
      where: { id: { in: examIds } },
      select: { id: true, title: true, passPercentage: true },
    }),
    prisma.attempt.findMany({
      where: { examId: { in: examIds }, status: { not: 'IN_PROGRESS' } },
      select: { examId: true, percentage: true, passPercentage: true },
    }),
  ]);

  const passByExam = new Map<string, { passed: number; total: number }>();
  for (const row of passCounts) {
    const bucket = passByExam.get(row.examId) ?? { passed: 0, total: 0 };
    bucket.total += 1;
    if ((row.percentage ?? 0) >= row.passPercentage) {
      bucket.passed += 1;
    }
    passByExam.set(row.examId, bucket);
  }

  const titleById = new Map(exams.map((exam) => [exam.id, exam.title] as const));

  return {
    totalUsers,
    totalStudents,
    totalExams: examCounts.reduce((sum, row) => sum + row._count._all, 0),
    publishedExams: examStatusCount('PUBLISHED'),
    draftExams: examStatusCount('DRAFT'),
    archivedExams: examStatusCount('ARCHIVED'),
    totalQuestions,
    totalAttempts: attemptCounts.reduce((sum, row) => sum + row._count._all, 0),
    completedAttempts:
      attemptStatusCount('SUBMITTED') + attemptStatusCount('EXPIRED'),
    inProgressAttempts: attemptStatusCount('IN_PROGRESS'),
    averagePercentage: Math.round((gradedAggregate._avg.percentage ?? 0) * 100) / 100,
    examPerformance: perExam
      .map((row) => {
        const bucket = passByExam.get(row.examId) ?? { passed: 0, total: 0 };
        return {
          examId: row.examId,
          title: titleById.get(row.examId) ?? 'Unknown exam',
          attempts: row._count._all,
          averagePercentage: Math.round((row._avg.percentage ?? 0) * 100) / 100,
          passRate: toPercentage(bucket.passed, bucket.total),
        };
      })
      .sort((a, b) => b.attempts - a.attempts),
  };
}

/* -------------------------------------------------------------------------- */
/* Authoring reads                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The full question set WITH the answer key - the editor and the admin preview
 * both need it. Reachable only through the admin router, which is role-gated on
 * the server; there is no student-facing route that returns this shape.
 */
export interface AdminQuestionView {
  id: string;
  prompt: string;
  explanation: string | null;
  position: number;
  points: number;
  topic: TopicView;
  options: { id: string; text: string; isCorrect: boolean; position: number }[];
}

export async function getExamQuestionsForAdmin(examId: string): Promise<AdminQuestionView[]> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
  if (!exam) {
    throw notFound('Exam not found.');
  }

  const questions = await prisma.question.findMany({
    where: { examId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      prompt: true,
      explanation: true,
      position: true,
      points: true,
      topic: true,
      options: {
        orderBy: { position: 'asc' },
        select: { id: true, text: true, isCorrect: true, position: true },
      },
    },
  });

  return questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    explanation: question.explanation,
    position: question.position,
    points: question.points,
    topic: toTopicView(question.topic),
    options: question.options,
  }));
}
