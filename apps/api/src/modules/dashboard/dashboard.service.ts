import { Prisma } from '@prisma/client';
import type {
  DashboardAttempt,
  DashboardNextAction,
  DashboardProgressPoint,
  DashboardStats,
  DashboardTopicPerformance,
  ExamSummary,
  StudentDashboard,
} from '@examprep/shared';
import { prisma } from '../../db/prisma';
import { toPercentage } from '../attempts/grading';
import { listPublishedExams } from '../exams/exam.service';
import { expireDueAttempts } from '../attempts/attempt.service';

const RECENT_LIMIT = 5;
const PROGRESS_LIMIT = 12;
const WEAK_TOPIC_THRESHOLD = 70;

interface TopicRow {
  topicId: string;
  topicName: string;
  answered: bigint;
  correct: bigint;
}

/**
 * Topic accuracy, aggregated in the database.
 *
 * Written as raw SQL on purpose: this is a three-table GROUP BY with a
 * conditional count, which Prisma's `groupBy` cannot express (it does not group
 * across relations). The alternative - pulling every answer row into Node and
 * reducing it - is an unbounded memory read that grows with the learner's
 * history.
 *
 * The user id is interpolated through Prisma.sql's tagged template, so it is
 * sent as a bound parameter ($1), not concatenated into the statement.
 */
async function topicPerformance(userId: string): Promise<DashboardTopicPerformance[]> {
  const rows = await prisma.$queryRaw<TopicRow[]>(Prisma.sql`
    SELECT
      q."topicId"                                       AS "topicId",
      t."name"                                          AS "topicName",
      COUNT(*)                                          AS "answered",
      COUNT(*) FILTER (WHERE aa."isCorrect" IS TRUE)    AS "correct"
    FROM "AttemptAnswer" aa
    JOIN "Attempt"  a ON a."id" = aa."attemptId"
    JOIN "Question" q ON q."id" = aa."questionId"
    JOIN "Topic"    t ON t."id" = q."topicId"
    WHERE a."userId" = ${userId}
      AND a."status" <> 'IN_PROGRESS'
      AND aa."selectedOptionId" IS NOT NULL
    GROUP BY q."topicId", t."name"
    ORDER BY t."name" ASC
  `);

  return rows.map((row) => {
    const answered = Number(row.answered);
    const correct = Number(row.correct);
    return {
      topicId: row.topicId,
      topicName: row.topicName,
      answered,
      correct,
      accuracy: toPercentage(correct, answered),
    };
  });
}

function toDashboardAttempt(row: {
  id: string;
  examId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  startedAt: Date;
  submittedAt: Date | null;
  percentage: number | null;
  passPercentage: number;
  exam: { title: string };
}): DashboardAttempt {
  return {
    attemptId: row.id,
    examId: row.examId,
    examTitle: row.exam.title,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    percentage: row.percentage,
    passed: row.percentage === null ? null : row.percentage >= row.passPercentage,
  };
}

/**
 * Builds the learner's dashboard.
 *
 * This is the one read in the product that genuinely needs seven unrelated
 * shapes at once (counters, recent attempts, resumable attempts,
 * recommendations, topic accuracy, a progress series and a next action). Over
 * REST it is either seven round trips or a bespoke endpoint that returns a
 * fixed blob; it is served over GraphQL instead so the client asks for exactly
 * the parts the current screen renders. See docs/architecture.md
 * ("Why GraphQL, and only here").
 */
export async function getStudentDashboard(userId: string): Promise<StudentDashboard> {
  // Close any attempt whose clock ran out while the learner was away, so the
  // "resume" card never offers an attempt that is already dead.
  await expireDueAttempts(userId);

  const [graded, inProgress, examsAvailable, topics, answerTotals] = await Promise.all([
    prisma.attempt.findMany({
      where: { userId, status: { not: 'IN_PROGRESS' } },
      orderBy: { submittedAt: 'desc' },
      take: Math.max(RECENT_LIMIT, PROGRESS_LIMIT),
      select: {
        id: true,
        examId: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        percentage: true,
        passPercentage: true,
        exam: { select: { title: true } },
      },
    }),
    prisma.attempt.findMany({
      where: { userId, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        examId: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        percentage: true,
        passPercentage: true,
        exam: { select: { title: true } },
      },
    }),
    prisma.exam.count({ where: { status: 'PUBLISHED' } }),
    topicPerformance(userId),
    prisma.attempt.aggregate({
      where: { userId, status: { not: 'IN_PROGRESS' } },
      _count: { _all: true },
      _avg: { percentage: true },
      _max: { percentage: true },
    }),
  ]);

  const passedCount = graded.filter(
    (row) => (row.percentage ?? 0) >= row.passPercentage,
  ).length;

  const totalAnswered = topics.reduce((sum, topic) => sum + topic.answered, 0);
  const totalCorrect = topics.reduce((sum, topic) => sum + topic.correct, 0);

  const stats: DashboardStats = {
    attemptsCompleted: answerTotals._count._all,
    attemptsInProgress: inProgress.length,
    examsAvailable,
    averagePercentage: Math.round((answerTotals._avg.percentage ?? 0) * 100) / 100,
    bestPercentage: Math.round((answerTotals._max.percentage ?? 0) * 100) / 100,
    totalQuestionsAnswered: totalAnswered,
    totalCorrect,
    accuracy: toPercentage(totalCorrect, totalAnswered),
    // Pass rate is computed over the attempts we loaded (the most recent
    // window), which is what the dashboard displays.
    passRate: toPercentage(passedCount, graded.length),
  };

  const progress: DashboardProgressPoint[] = graded
    .filter((row) => row.submittedAt !== null)
    .slice(0, PROGRESS_LIMIT)
    .reverse()
    .map((row) => ({
      attemptId: row.id,
      submittedAt: (row.submittedAt as Date).toISOString(),
      percentage: row.percentage ?? 0,
      examTitle: row.exam.title,
    }));

  const weakest = [...topics]
    .filter((topic) => topic.answered >= 3)
    .sort((a, b) => a.accuracy - b.accuracy)[0];

  const recommendedExams = await recommendExams(userId, weakest?.topicId);

  return {
    stats,
    recentAttempts: graded.slice(0, RECENT_LIMIT).map(toDashboardAttempt),
    inProgressAttempts: inProgress.map(toDashboardAttempt),
    recommendedExams,
    topicPerformance: topics,
    progress,
    nextAction: nextAction({
      inProgress: inProgress.map(toDashboardAttempt),
      gradedCount: graded.length,
      weakest,
      recommendedExams,
    }),
  };
}

/**
 * Recommendations: exams in the learner's weakest topic first, then anything
 * else published. Intentionally simple and explainable - there is no hidden
 * model here, just "practise what you are worst at".
 */
async function recommendExams(
  userId: string,
  weakTopicId: string | undefined,
): Promise<ExamSummary[]> {
  const take = 3;

  if (weakTopicId) {
    const inTopic = await listPublishedExams(
      { page: 1, pageSize: take, sort: 'createdAt', order: 'desc', topicId: weakTopicId },
      userId,
    );
    if (inTopic.items.length > 0) {
      return inTopic.items;
    }
  }

  const latest = await listPublishedExams(
    { page: 1, pageSize: take, sort: 'createdAt', order: 'desc' },
    userId,
  );
  return latest.items;
}

export function nextAction(input: {
  inProgress: DashboardAttempt[];
  gradedCount: number;
  weakest: DashboardTopicPerformance | undefined;
  recommendedExams: ExamSummary[];
}): DashboardNextAction {
  const resumable = input.inProgress[0];
  if (resumable) {
    return {
      kind: 'RESUME_ATTEMPT',
      label: 'Resume your exam',
      detail: `You have an unfinished attempt at "${resumable.examTitle}".`,
      examId: resumable.examId,
      attemptId: resumable.attemptId,
    };
  }

  if (input.gradedCount === 0) {
    const first = input.recommendedExams[0];
    return {
      kind: 'START_FIRST_EXAM',
      label: first ? `Start "${first.title}"` : 'Browse the catalogue',
      detail: 'Take your first practice exam to establish a baseline.',
      examId: first?.id ?? null,
      attemptId: null,
    };
  }

  if (input.weakest && input.weakest.accuracy < WEAK_TOPIC_THRESHOLD) {
    const target = input.recommendedExams[0];
    return {
      kind: 'PRACTISE_WEAK_TOPIC',
      label: target ? `Practise ${input.weakest.topicName}` : 'Browse the catalogue',
      detail: `${input.weakest.topicName} is your weakest topic at ${input.weakest.accuracy}% accuracy.`,
      examId: target?.id ?? null,
      attemptId: null,
    };
  }

  const next = input.recommendedExams[0];
  return {
    kind: 'EXPLORE_CATALOGUE',
    label: next ? `Try "${next.title}"` : 'Browse the catalogue',
    detail: 'You are on track. Keep your streak going with another paper.',
    examId: next?.id ?? null,
    attemptId: null,
  };
}
